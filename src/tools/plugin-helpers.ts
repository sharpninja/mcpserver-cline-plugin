import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

import { cacheStatus } from '../cache/cache-manager.js';
import { findMarkerFile, parseMarkerField, verifySignature } from '../discovery/marker-resolver.js';
import type { ReplBridge } from '../transport/repl-bridge.js';
import { graphragTools } from './graphrag.js';
import { requirementsTools } from './requirements.js';
import { getSessionShimState, handleSessionTool, sessionTools } from './session.js';
import { memoryTools } from './memory.js';
import { todoTools } from './todo.js';

const STATUS_TOOL_NAMES = ['mcp_cline_status', 'mcp_status', 'plugin_status'];
const FINAL_RESPONSE_TOOL_NAMES = ['final_response', 'mcp_final_response', 'session_final_response'];
const helperToolNames = [...STATUS_TOOL_NAMES, ...FINAL_RESPONSE_TOOL_NAMES];

interface PackageMetadata {
  name: string;
  version: string;
}

interface MarkerStatus {
  path: string;
  trust: 'missing' | 'signature_verified' | 'signature_failed';
  healthNonce: 'not_checked' | 'verified' | 'failed';
  healthNonceValue: string;
  healthError: string;
  baseUrl: string;
  workspacePath: string;
}

function readPackageMetadata(): PackageMetadata {
  const startDirs = [
    process.env.MCPSERVER_PLUGIN_ROOT,
    process.env.MCP_PLUGIN_ROOT,
    process.cwd(),
    process.argv[1] ? path.dirname(process.argv[1]) : undefined,
  ].filter((dir): dir is string => !!dir);

  for (const startDir of startDirs) {
    let dir = path.resolve(startDir);
    for (let depth = 0; depth < 5; depth++) {
      const packagePath = path.join(dir, 'package.json');
      if (fs.existsSync(packagePath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as Partial<PackageMetadata>;
          return {
            name: raw.name ?? '@sharpninja/mcpserver-cline-plugin',
            version: raw.version ?? 'unknown',
          };
        } catch {
          break;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return {
    name: '@sharpninja/mcpserver-cline-plugin',
    version: 'unknown',
  };
}

async function readMarkerStatus(workspacePath: string, checkHealth: boolean): Promise<MarkerStatus> {
  const markerFile = findMarkerFile(workspacePath);
  if (!markerFile) {
    return {
      path: '',
      trust: 'missing',
      healthNonce: 'not_checked',
      healthNonceValue: '',
      healthError: '',
      baseUrl: '',
      workspacePath: '',
    };
  }

  const baseUrl = parseMarkerField(markerFile, 'baseUrl') ?? '';
  const markerWorkspacePath = parseMarkerField(markerFile, 'workspacePath') ?? '';
  const status: MarkerStatus = {
    path: markerFile,
    trust: verifySignature(markerFile) ? 'signature_verified' : 'signature_failed',
    healthNonce: 'not_checked',
    healthNonceValue: '',
    healthError: '',
    baseUrl,
    workspacePath: markerWorkspacePath,
  };

  if (!checkHealth || !baseUrl || typeof fetch !== 'function') {
    return status;
  }

  const nonce = `nonce-${Date.now()}-${process.pid}`;
  status.healthNonceValue = nonce;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health?nonce=${encodeURIComponent(nonce)}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json() as { nonce?: unknown };
    status.healthNonce = body.nonce === nonce ? 'verified' : 'failed';
    if (status.healthNonce === 'failed') {
      status.healthError = 'Nonce mismatch';
    }
  } catch (error) {
    status.healthNonce = 'failed';
    status.healthError = error instanceof Error ? error.message : String(error);
  }

  return status;
}

function toolNames(tools: Tool[]): string[] {
  return tools.map((tool) => tool.name);
}

function responseText(args: Record<string, unknown>): string {
  const response = args.response ?? args.text ?? args.message;
  if (typeof response === 'string' && response.trim().length > 0) {
    return response;
  }
  return 'Turn completed.';
}

export const pluginHelperTools: Tool[] = [
  ...STATUS_TOOL_NAMES.map((name) => ({
    name,
    description:
      'Report Cline McpServer plugin identity, marker trust, health, current session/turn state, supported tool namespaces, and usage guidance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        checkHealth: {
          type: 'boolean',
          description: 'When true, verify the marker health nonce if a marker baseUrl is available. Defaults to true.',
        },
      },
    },
  })),
  ...FINAL_RESPONSE_TOOL_NAMES.map((name) => ({
    name,
    description:
      'Complete the active session log turn with the final response text. Alias for session_complete_turn.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        response: { type: 'string', description: 'Final response text to record on the current turn.' },
        text: { type: 'string', description: 'Alias for response.' },
        message: { type: 'string', description: 'Alias for response.' },
      },
    },
  })),
];

const knownTools = new Set(helperToolNames);

export function canHandlePluginHelperTool(name: string): boolean {
  return knownTools.has(name);
}

export async function handlePluginHelperTool(
  name: string,
  args: Record<string, unknown>,
  bridge: ReplBridge,
) {
  if (STATUS_TOOL_NAMES.includes(name)) {
    const metadata = readPackageMetadata();
    const workspacePath =
      process.env.MCPSERVER_WORKSPACE_PATH ??
      process.env.MCP_WORKSPACE_PATH ??
      process.cwd();
    const checkHealth = args.checkHealth !== false;
    const session = getSessionShimState();

    const status = {
      identity: {
        pluginName: metadata.name,
        pluginVersion: metadata.version,
        serverName: 'mcpserver-cline',
        serverVariant: 'Cline TypeScript MCP server',
      },
      workspacePath,
      cache: {
        pending: await cacheStatus(),
      },
      marker: await readMarkerStatus(workspacePath, checkHealth),
      session: session
        ? {
            sourceType: session.sourceType,
            sessionId: session.sessionId,
            title: session.title,
            model: session.model ?? '',
            status: session.status,
          }
        : null,
      currentTurn: session?.currentTurn
        ? {
            requestId: session.currentTurn.requestId,
            queryTitle: session.currentTurn.queryTitle,
            status: session.currentTurn.status,
            tags: session.currentTurn.tags ?? [],
            actionCount: session.currentTurn.actions.length,
            dialogItemCount: session.currentTurn.dialogItems.length,
          }
        : null,
      namespaces: [
        'workflow.sessionlog',
        'workflow.todo',
        'workflow.memory',
        'workflow.requirements',
        'workflow.graphrag',
        'client',
      ],
      tools: {
        session: toolNames(sessionTools),
        todo: toolNames(todoTools),
        memory: toolNames(memoryTools),
        requirements: toolNames(requirementsTools),
        graphrag: toolNames(graphragTools),
        helpers: helperToolNames,
      },
      guidance: {
        status: 'Call mcp_cline_status to inspect marker trust, workspace targeting, cache, and active turn state.',
        session:
          'Use session_open, session_begin_turn, session_append_dialog, session_append_actions, and session_complete_turn for audit logging.',
        finalResponse:
          'Call final_response, mcp_final_response, or session_final_response to complete the current turn through session_complete_turn.',
        rawRepl:
          'Use the typed MCP tools instead of raw workflow.sessionlog.* or direct mcpserver-repl calls.',
      },
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
    };
  }

  if (FINAL_RESPONSE_TOOL_NAMES.includes(name)) {
    return handleSessionTool('session_complete_turn', { response: responseText(args) }, bridge);
  }

  throw new Error(`Unknown plugin helper tool: ${name}`);
}
