import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ReplBridge } from '../transport/repl-bridge.js';

export const todoTools: Tool[] = [
  {
    name: 'todo_query',
    description:
      'Query project TODOs with optional filters for keyword, priority, section, and completion status.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Filter by keyword in title or description' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by priority' },
        section: { type: 'string', description: 'Filter by section/area' },
        done: { type: 'boolean', description: 'Filter by completion status' },
      },
    },
  },
  {
    name: 'todo_get',
    description: 'Fetch the full details of a single TODO by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID (e.g. MCP-AUTH-001 or ISSUE-17)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_select',
    description: 'Set a TODO as the active working context for the session.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to select as active context' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_create',
    description: 'Create a new project TODO. Use ISSUE-NEW as id to create a GitHub-backed issue.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID (pattern: [A-Z]+-[A-Z0-9]+-\\d{3} or ISSUE-NEW)' },
        title: { type: 'string', description: 'TODO title' },
        section: { type: 'string', description: 'Project section or area' },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Priority level' },
        estimate: { type: 'string', description: 'Time estimate (e.g. 4h, 2d)' },
        description: { type: 'array', items: { type: 'string' }, description: 'Bullet-point description' },
        implementationTasks: {
          type: 'array',
          items: { type: 'object', properties: { task: { type: 'string' }, done: { type: 'boolean' } }, required: ['task'] },
          description: 'Sub-tasks with completion status',
        },
        dependsOn: { type: 'array', items: { type: 'string' }, description: 'TODO IDs this depends on' },
        functionalRequirements: { type: 'array', items: { type: 'string' }, description: 'FR-* IDs' },
        technicalRequirements: { type: 'array', items: { type: 'string' }, description: 'TR-* IDs' },
        technicalDetails: { type: 'string', description: 'Architecture or design notes' },
      },
      required: ['id', 'title', 'section', 'priority'],
    },
  },
  {
    name: 'todo_update',
    description: 'Modify fields of an existing TODO. Set done:true with doneSummary to mark complete.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to update' },
        remaining: { type: 'string', description: 'Work still needed' },
        done: { type: 'boolean', description: 'Mark as completed' },
        doneSummary: { type: 'string', description: 'Summary of completed work (required when done:true)' },
        implementationTasks: {
          type: 'array',
          items: { type: 'object', properties: { task: { type: 'string' }, done: { type: 'boolean' } }, required: ['task'] },
        },
        technicalDetails: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_update_selected',
    description: 'Patch the currently selected TODO without repeating the ID.',
    inputSchema: {
      type: 'object',
      properties: {
        remaining: { type: 'string' },
        done: { type: 'boolean' },
        doneSummary: { type: 'string' },
        implementationTasks: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, done: { type: 'boolean' } }, required: ['task'] } },
      },
    },
  },
  {
    name: 'todo_delete',
    description: 'Remove a TODO permanently.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_stream_status',
    description: 'Request an AI-driven status analysis of a TODO, showing blockers and dependency state.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to analyze' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_stream_plan',
    description: 'Generate a streaming implementation plan for a TODO.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to plan' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_stream_implement',
    description: 'Execute an AI-driven implementation run for a TODO and stream progress.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to implement' },
      },
      required: ['id'],
    },
  },
  {
    name: 'todo_analyze_requirements',
    description: 'Detect missing FR/TR traceability for a TODO.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TODO ID to analyze' },
      },
      required: ['id'],
    },
  },
];

const toolMethodMap: Record<string, string> = {
  todo_query: 'workflow.todo.query',
  todo_get: 'workflow.todo.get',
  todo_select: 'workflow.todo.select',
  todo_create: 'workflow.todo.create',
  todo_update: 'workflow.todo.update',
  todo_update_selected: 'workflow.todo.updateSelected',
  todo_delete: 'workflow.todo.delete',
  todo_stream_status: 'workflow.todo.streamStatus',
  todo_stream_plan: 'workflow.todo.streamPlan',
  todo_stream_implement: 'workflow.todo.streamImplement',
  todo_analyze_requirements: 'workflow.todo.analyzeRequirements',
};

export function canHandleTodoTool(name: string): boolean {
  return name in toolMethodMap;
}

export async function handleTodoTool(
  name: string,
  args: Record<string, unknown>,
  bridge: ReplBridge,
) {
  const method = toolMethodMap[name];
  if (!method) throw new Error(`Unknown todo tool: ${name}`);

  const response = await bridge.invoke(method, args);

  if (response.type === 'error') {
    const payload = response.payload as { message?: string; code?: string };
    throw new Error(`${payload.code ?? 'error'}: ${payload.message ?? 'Unknown error'}`);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response.payload, null, 2),
      },
    ],
  };
}
