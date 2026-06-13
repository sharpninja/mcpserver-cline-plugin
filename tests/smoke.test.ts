/**
 * Thin end-to-end smoke for the Model C wiring: the cline v1 host glue keeps
 * only src/index.ts + src/tools/plugin-helpers.ts and consumes every shared
 * transport/cache/marker/session/tool module from
 * @sharpninja/mcpserver-plugin-core. src/index.ts runs main() at import time
 * (it spawns the MCP stdio server), so this smoke does not import it directly;
 * instead it reproduces index.ts's assembly + dispatch contract against the
 * exact same package exports and helper module, proving the surface resolves
 * and routes the way the wired server does.
 */
import {
  todoTools,
  sessionTools,
  memoryTools,
  requirementsTools,
  graphragTools,
  canHandleTodoTool,
  canHandleSessionTool,
  canHandleMemoryTool,
  canHandleRequirementsTool,
  canHandleGraphragTool,
  handleSessionTool,
  type ReplBridge,
  type ReplResponse,
} from '@sharpninja/mcpserver-plugin-core';
import { __resetSessionShimForTests } from '@sharpninja/mcpserver-plugin-core/dist/tools/session.js';
import {
  pluginHelperTools,
  canHandlePluginHelperTool,
  handlePluginHelperTool,
} from '../src/tools/plugin-helpers.js';

class FakeBridge {
  calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  nextResponse: ReplResponse = { type: 'result', payload: { ok: true } };

  async invoke(method: string, params?: Record<string, unknown>): Promise<ReplResponse> {
    this.calls.push({ method, params });
    return this.nextResponse;
  }
  async ensure(): Promise<void> {}
}

function asBridge(fake: FakeBridge): ReplBridge {
  return fake as unknown as ReplBridge;
}

// Mirror the catalog assembled in src/index.ts.
const allTools = [
  ...todoTools,
  ...sessionTools,
  ...memoryTools,
  ...requirementsTools,
  ...graphragTools,
  ...pluginHelperTools,
];

describe('cline v1 host glue (Model C wiring)', () => {
  beforeEach(() => __resetSessionShimForTests());
  afterEach(() => __resetSessionShimForTests());

  test('publishes the full tool catalog from the core package plus host helpers', () => {
    const names = allTools.map((tool) => tool.name);

    // Core-package tool namespaces are present.
    expect(names).toEqual(expect.arrayContaining(['session_open', 'session_complete_turn']));
    expect(names).toEqual(expect.arrayContaining(todoTools.map((tool) => tool.name)));
    expect(names).toEqual(expect.arrayContaining(memoryTools.map((tool) => tool.name)));
    expect(names).toEqual(expect.arrayContaining(requirementsTools.map((tool) => tool.name)));
    expect(names).toEqual(expect.arrayContaining(graphragTools.map((tool) => tool.name)));

    // Host-specific helper tools are present.
    expect(names).toEqual(
      expect.arrayContaining(['mcp_cline_status', 'final_response', 'session_final_response']),
    );

    // Every advertised tool carries a name + inputSchema.
    for (const tool of allTools) {
      expect(typeof tool.name).toBe('string');
      expect(tool).toHaveProperty('inputSchema');
    }
  });

  test('helper-first dispatch precedence matches index.ts routing', () => {
    // Helpers win before the typed namespaces, exactly as src/index.ts checks.
    expect(canHandlePluginHelperTool('mcp_cline_status')).toBe(true);
    expect(canHandlePluginHelperTool('final_response')).toBe(true);

    // The shared namespaces own their tools and not the helper aliases.
    expect(canHandleSessionTool('session_open')).toBe(true);
    expect(canHandleTodoTool('todo_create')).toBe(true);
    expect(canHandleMemoryTool('final_response')).toBe(false);
    expect(canHandleRequirementsTool('mcp_cline_status')).toBe(false);
    expect(canHandleGraphragTool('mcp_cline_status')).toBe(false);
  });

  test('final_response routes through the core session shim and returns an MCP text envelope', async () => {
    const fake = new FakeBridge();
    const oldFailsafeDir = process.env.MCPSERVER_FAILSAFE_DIR;
    delete process.env.MCPSERVER_FAILSAFE_DIR;

    try {
      await handleSessionTool(
        'session_open',
        { agent: 'Cline', sessionId: 'Cline-smoke-001', title: 'smoke' },
        asBridge(fake),
      );
      await handleSessionTool(
        'session_begin_turn',
        { requestId: 'req-smoke-001', queryTitle: 'smoke', queryText: 'smoke test' },
        asBridge(fake),
      );

      const result = await handlePluginHelperTool(
        'final_response',
        { response: 'smoke done' },
        asBridge(fake),
      );

      // Host glue wraps the raw core payload in the {content:[{type:'text'}]} envelope.
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(fake.calls[0].method).toBe('client.SessionLog.UpsertTurnAsync');
    } finally {
      if (oldFailsafeDir === undefined) delete process.env.MCPSERVER_FAILSAFE_DIR;
      else process.env.MCPSERVER_FAILSAFE_DIR = oldFailsafeDir;
    }
  });
});
