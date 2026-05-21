import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  canHandlePluginHelperTool,
  handlePluginHelperTool,
  pluginHelperTools,
} from '../src/tools/plugin-helpers.js';
import {
  __resetSessionShimForTests,
  getSessionShimState,
  handleSessionTool,
} from '../src/tools/session.js';
import type { ReplBridge, ReplResponse } from '../src/transport/repl-bridge.js';

class FakeBridge {
  calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  nextResponse: ReplResponse = { type: 'result', payload: { ok: true } };

  async invoke(method: string, params?: Record<string, unknown>): Promise<ReplResponse> {
    this.calls.push({ method, params });
    return this.nextResponse;
  }
}

function asBridge(fake: FakeBridge): ReplBridge {
  return fake as unknown as ReplBridge;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('plugin helper tools', () => {
  beforeEach(() => {
    __resetSessionShimForTests();
  });

  afterEach(() => {
    __resetSessionShimForTests();
  });

  test('registers status and final-response aliases', () => {
    const names = pluginHelperTools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining([
      'mcp_cline_status',
      'mcp_status',
      'plugin_status',
      'final_response',
      'mcp_final_response',
      'session_final_response',
    ]));
    expect(canHandlePluginHelperTool('mcp_cline_status')).toBe(true);
    expect(canHandlePluginHelperTool('final_response')).toBe(true);
    expect(canHandlePluginHelperTool('session_complete_turn')).toBe(false);
  });

  test('mcp_cline_status reports identity, workspace, session, turn, namespaces, and guidance', async () => {
    const fake = new FakeBridge();
    const oldWorkspace = process.env.MCP_WORKSPACE_PATH;
    const oldServerWorkspace = process.env.MCPSERVER_WORKSPACE_PATH;
    const oldFailsafeDir = process.env.MCPSERVER_FAILSAFE_DIR;
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cline-status-workspace-'));
    const failsafeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cline-status-failsafe-'));

    process.env.MCP_WORKSPACE_PATH = workspace;
    delete process.env.MCPSERVER_WORKSPACE_PATH;
    process.env.MCPSERVER_FAILSAFE_DIR = failsafeDir;

    try {
      await handleSessionTool(
        'session_open',
        { agent: 'Cline', sessionId: 'Cline-status-001', title: 'status test' },
        asBridge(fake),
      );
      await handleSessionTool(
        'session_begin_turn',
        { requestId: 'req-status-001', queryTitle: 'status', queryText: 'check status' },
        asBridge(fake),
      );

      const result = await handlePluginHelperTool(
        'mcp_cline_status',
        { checkHealth: false },
        asBridge(fake),
      );
      const status = JSON.parse(result.content[0].text);

      expect(fake.calls).toHaveLength(0);
      expect(status.identity).toMatchObject({
        pluginName: '@sharpninja/mcpserver-cline-plugin',
        serverName: 'mcpserver-cline',
      });
      expect(status.workspacePath).toBe(workspace);
      expect(status.marker.trust).toBe('missing');
      expect(status.session).toMatchObject({
        sourceType: 'Cline',
        sessionId: 'Cline-status-001',
        status: 'in_progress',
      });
      expect(status.currentTurn).toMatchObject({
        requestId: 'req-status-001',
        queryTitle: 'status',
        status: 'in_progress',
      });
      expect(status.namespaces).toEqual(expect.arrayContaining(['workflow.sessionlog', 'workflow.todo']));
      expect(status.tools.helpers).toEqual(expect.arrayContaining(['mcp_cline_status', 'final_response']));
      expect(status.guidance.finalResponse).toContain('session_complete_turn');
    } finally {
      restoreEnv('MCP_WORKSPACE_PATH', oldWorkspace);
      restoreEnv('MCPSERVER_WORKSPACE_PATH', oldServerWorkspace);
      restoreEnv('MCPSERVER_FAILSAFE_DIR', oldFailsafeDir);
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.rmSync(failsafeDir, { recursive: true, force: true });
    }
  });

  test('status verifies health nonce when marker baseUrl is available', async () => {
    const fake = new FakeBridge();
    const oldFetch = globalThis.fetch;
    const oldWorkspace = process.env.MCP_WORKSPACE_PATH;
    const oldServerWorkspace = process.env.MCPSERVER_WORKSPACE_PATH;
    const oldFailsafeDir = process.env.MCPSERVER_FAILSAFE_DIR;
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cline-marker-workspace-'));
    const failsafeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cline-marker-failsafe-'));

    fs.writeFileSync(
      path.join(workspace, 'AGENTS-README-FIRST.yaml'),
      `port: '8765'
baseUrl: 'http://127.0.0.1:8765'
apiKey: 'test-api-key'
workspace: 'TestWorkspace'
workspacePath: '${workspace.replace(/\\/g, '\\\\')}'
`,
    );

    process.env.MCP_WORKSPACE_PATH = workspace;
    delete process.env.MCPSERVER_WORKSPACE_PATH;
    process.env.MCPSERVER_FAILSAFE_DIR = failsafeDir;
    globalThis.fetch = jest.fn(async (url: unknown) => {
      const nonce = new URL(String(url)).searchParams.get('nonce');
      return {
        ok: true,
        status: 200,
        json: async () => ({ nonce }),
      };
    }) as unknown as typeof fetch;

    try {
      const result = await handlePluginHelperTool('mcp_status', {}, asBridge(fake));
      const status = JSON.parse(result.content[0].text);

      expect(status.marker).toMatchObject({
        trust: 'signature_failed',
        healthNonce: 'verified',
        baseUrl: 'http://127.0.0.1:8765',
      });
      expect(status.marker.healthNonceValue).toMatch(/^nonce-/);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = oldFetch;
      restoreEnv('MCP_WORKSPACE_PATH', oldWorkspace);
      restoreEnv('MCPSERVER_WORKSPACE_PATH', oldServerWorkspace);
      restoreEnv('MCPSERVER_FAILSAFE_DIR', oldFailsafeDir);
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.rmSync(failsafeDir, { recursive: true, force: true });
    }
  });

  test('final_response completes the current turn through session_complete_turn', async () => {
    const fake = new FakeBridge();
    const oldFailsafeDir = process.env.MCPSERVER_FAILSAFE_DIR;
    const failsafeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cline-final-failsafe-'));
    process.env.MCPSERVER_FAILSAFE_DIR = failsafeDir;

    try {
      await handleSessionTool(
        'session_open',
        { agent: 'Cline', sessionId: 'Cline-final-001', title: 'final response test' },
        asBridge(fake),
      );
      await handleSessionTool(
        'session_begin_turn',
        { requestId: 'req-final-001', queryTitle: 'final', queryText: 'finish the turn' },
        asBridge(fake),
      );

      await handlePluginHelperTool('final_response', { response: 'completed by helper' }, asBridge(fake));

      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0].method).toBe('client.SessionLog.SubmitAsync');
      const payload = fake.calls[0].params as { sessionLog: { turns: Record<string, unknown>[] } };
      expect(payload.sessionLog.turns[0]).toMatchObject({
        requestId: 'req-final-001',
        status: 'completed',
        response: 'completed by helper',
      });
      expect(getSessionShimState()!.currentTurn).toBeUndefined();
    } finally {
      restoreEnv('MCPSERVER_FAILSAFE_DIR', oldFailsafeDir);
      fs.rmSync(failsafeDir, { recursive: true, force: true });
    }
  });
});
