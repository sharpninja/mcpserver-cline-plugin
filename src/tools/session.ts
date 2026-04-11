import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ReplBridge } from '../transport/repl-bridge.js';

export const sessionTools: Tool[] = [
  {
    name: 'session_bootstrap',
    description: 'Initialize the session log subsystem (idempotent). Call once at startup.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'session_open',
    description: 'Create a new session record at the start of a work session.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name (e.g. Cline)' },
        sessionId: { type: 'string', description: 'Session ID (format: Agent-yyyyMMddTHHmmssZ-suffix)' },
        title: { type: 'string', description: 'Session title' },
        model: { type: 'string', description: 'Model identifier' },
      },
      required: ['agent', 'sessionId', 'title'],
    },
  },
  {
    name: 'session_begin_turn',
    description: 'Start a new turn before working on a user request.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'Turn request ID (format: req-yyyyMMddTHHmmssZ-slug)' },
        queryTitle: { type: 'string', description: 'Short title for the user request' },
        queryText: { type: 'string', description: 'Full text of the user request' },
      },
      required: ['requestId', 'queryTitle', 'queryText'],
    },
  },
  {
    name: 'session_update_turn',
    description: 'Record interpretation, response summary, tags, and referenced files for the active turn.',
    inputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Agent response summary' },
        interpretation: { type: 'string', description: 'How the agent interpreted the request' },
        tokenCount: { type: 'number', description: 'Tokens used' },
        tags: { type: 'array', items: { type: 'string' }, description: 'FR-*, TR-*, feature, etc.' },
        contextList: { type: 'array', items: { type: 'string' }, description: 'File paths consulted' },
      },
    },
  },
  {
    name: 'session_append_dialog',
    description: 'Log reasoning steps, tool calls, observations, and decisions during the turn.',
    inputSchema: {
      type: 'object',
      properties: {
        dialogItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              role: { type: 'string', enum: ['model', 'tool', 'system', 'user'] },
              content: { type: 'string' },
              category: { type: 'string', enum: ['reasoning', 'tool_call', 'tool_result', 'observation', 'decision'] },
            },
            required: ['timestamp', 'role', 'content', 'category'],
          },
          description: 'Dialog items to append',
        },
      },
      required: ['dialogItems'],
    },
  },
  {
    name: 'session_append_actions',
    description: 'Record file operations and work artifacts for the active turn.',
    inputSchema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['edit', 'create', 'delete', 'design_decision', 'commit', 'pr_comment', 'issue_comment', 'web_reference', 'dependency_add'] },
              status: { type: 'string', enum: ['completed', 'pending'] },
              filePath: { type: 'string' },
            },
            required: ['order', 'description', 'type', 'status'],
          },
        },
      },
      required: ['actions'],
    },
  },
  {
    name: 'session_complete_turn',
    description: 'Finalize the active turn as successfully completed (immutable after this call).',
    inputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Final response summary' },
      },
    },
  },
  {
    name: 'session_fail_turn',
    description: 'Mark the active turn as failed with an error description.',
    inputSchema: {
      type: 'object',
      properties: {
        errorMessage: { type: 'string', description: 'Description of the failure' },
        errorCode: { type: 'string', description: 'Error code (e.g. dependency_missing)' },
      },
      required: ['errorMessage'],
    },
  },
  {
    name: 'session_query_history',
    description: 'Browse previous sessions for context continuity.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Filter by agent name (omit for all agents)' },
        limit: { type: 'number', description: 'Maximum sessions to return (default 10)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'session_close',
    description: 'Close the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name' },
        sessionId: { type: 'string', description: 'Session ID to close' },
        status: { type: 'string', enum: ['completed', 'failed'], description: 'Final session status' },
      },
      required: ['agent', 'sessionId'],
    },
  },
];

const toolMethodMap: Record<string, string> = {
  session_bootstrap: 'workflow.sessionlog.bootstrap',
  session_open: 'workflow.sessionlog.openSession',
  session_begin_turn: 'workflow.sessionlog.beginTurn',
  session_update_turn: 'workflow.sessionlog.updateTurn',
  session_append_dialog: 'workflow.sessionlog.appendDialog',
  session_append_actions: 'workflow.sessionlog.appendActions',
  session_complete_turn: 'workflow.sessionlog.completeTurn',
  session_fail_turn: 'workflow.sessionlog.failTurn',
  session_query_history: 'workflow.sessionlog.queryHistory',
  session_close: 'workflow.sessionlog.closeSession',
};

export function canHandleSessionTool(name: string): boolean {
  return name in toolMethodMap;
}

export async function handleSessionTool(
  name: string,
  args: Record<string, unknown>,
  bridge: ReplBridge,
) {
  const method = toolMethodMap[name];
  if (!method) throw new Error(`Unknown session tool: ${name}`);

  const response = await bridge.invoke(method, args);

  if (response.type === 'error') {
    const payload = response.payload as { message?: string; code?: string };
    throw new Error(`${payload.code ?? 'error'}: ${payload.message ?? 'Unknown error'}`);
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response.payload, null, 2) }],
  };
}
