import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ReplBridge } from '../transport/repl-bridge.js';

const STATUS_ENUM = ['pending', 'in_progress', 'completed', 'deferred'] as const;
const PRIORITY_ENUM = ['critical', 'high', 'medium', 'low'] as const;

export const requirementsTools: Tool[] = [
  // --- Functional Requirements ---
  {
    name: 'req_list_fr',
    description: 'List functional requirements with optional area and status filters.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Filter by area (e.g. MCP, AUTH)' },
        status: { type: 'string', enum: [...STATUS_ENUM] },
      },
    },
  },
  {
    name: 'req_get_fr',
    description: 'Fetch a single functional requirement by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'FR ID (pattern: FR-AREA-###)' } },
      required: ['id'],
    },
  },
  {
    name: 'req_create_fr',
    description: 'Create a new functional requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'FR ID (pattern: FR-AREA-###)' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: [...PRIORITY_ENUM] },
        area: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id', 'title', 'description', 'priority', 'area'],
    },
  },
  {
    name: 'req_update_fr',
    description: 'Modify an existing functional requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: [...STATUS_ENUM] },
        priority: { type: 'string', enum: [...PRIORITY_ENUM] },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'req_delete_fr',
    description: 'Remove a functional requirement.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  // --- Technical Requirements ---
  {
    name: 'req_list_tr',
    description: 'List technical requirements with optional area and subarea filters.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string' },
        subarea: { type: 'string' },
        status: { type: 'string', enum: [...STATUS_ENUM] },
      },
    },
  },
  {
    name: 'req_create_tr',
    description: 'Create a new technical requirement. TR IDs require both area and subarea (TR-AREA-SUBAREA-###).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TR ID (pattern: TR-AREA-SUBAREA-###)' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: [...PRIORITY_ENUM] },
        area: { type: 'string' },
        subarea: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id', 'title', 'description', 'priority', 'area', 'subarea'],
    },
  },
  {
    name: 'req_update_tr',
    description: 'Modify an existing technical requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: [...STATUS_ENUM] },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'req_delete_tr',
    description: 'Remove a technical requirement.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  // --- Test Requirements ---
  {
    name: 'req_list_test',
    description: 'List test requirements with optional area filter.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string' },
        status: { type: 'string', enum: [...STATUS_ENUM] },
      },
    },
  },
  {
    name: 'req_create_test',
    description: 'Create a new test requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'TEST ID (pattern: TEST-AREA-###)' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: [...PRIORITY_ENUM] },
        area: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id', 'title', 'description', 'priority', 'area'],
    },
  },
  {
    name: 'req_update_test',
    description: 'Modify an existing test requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: [...STATUS_ENUM] },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'req_delete_test',
    description: 'Remove a test requirement.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  // --- Mappings ---
  {
    name: 'req_list_mappings',
    description: 'Query FR↔TR↔TEST traceability mappings.',
    inputSchema: {
      type: 'object',
      properties: {
        frId: { type: 'string', description: 'Filter by FR ID' },
        trId: { type: 'string', description: 'Filter by TR ID' },
        testId: { type: 'string', description: 'Filter by TEST ID' },
      },
    },
  },
  {
    name: 'req_create_mapping',
    description: 'Link a functional requirement to a technical requirement and test.',
    inputSchema: {
      type: 'object',
      properties: {
        frId: { type: 'string' },
        trId: { type: 'string' },
        testId: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['frId', 'trId', 'testId'],
    },
  },
  {
    name: 'req_delete_mapping',
    description: 'Remove a traceability link between FR and TR.',
    inputSchema: {
      type: 'object',
      properties: {
        frId: { type: 'string' },
        trId: { type: 'string' },
      },
      required: ['frId', 'trId'],
    },
  },
  // --- Documents ---
  {
    name: 'req_generate_document',
    description: 'Render requirements as a formatted document (matrix, functional, technical, testing).',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['markdown'], description: 'Output format' },
        docType: { type: 'string', enum: ['matrix', 'functional', 'technical', 'testing'] },
      },
      required: ['docType'],
    },
  },
  {
    name: 'req_ingest_document',
    description: 'Import requirements from a Markdown document.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Markdown content with FR/TR/TEST sections' },
        format: { type: 'string', enum: ['markdown'] },
      },
      required: ['content'],
    },
  },
];

const toolMethodMap: Record<string, string> = {
  req_list_fr: 'workflow.requirements.listFr',
  req_get_fr: 'workflow.requirements.getFr',
  req_create_fr: 'workflow.requirements.createFr',
  req_update_fr: 'workflow.requirements.updateFr',
  req_delete_fr: 'workflow.requirements.deleteFr',
  req_list_tr: 'workflow.requirements.listTr',
  req_create_tr: 'workflow.requirements.createTr',
  req_update_tr: 'workflow.requirements.updateTr',
  req_delete_tr: 'workflow.requirements.deleteTr',
  req_list_test: 'workflow.requirements.listTest',
  req_create_test: 'workflow.requirements.createTest',
  req_update_test: 'workflow.requirements.updateTest',
  req_delete_test: 'workflow.requirements.deleteTest',
  req_list_mappings: 'workflow.requirements.listMappings',
  req_create_mapping: 'workflow.requirements.createMapping',
  req_delete_mapping: 'workflow.requirements.deleteMapping',
  req_generate_document: 'workflow.requirements.generateDocument',
  req_ingest_document: 'workflow.requirements.ingestDocument',
};

export function canHandleRequirementsTool(name: string): boolean {
  return name in toolMethodMap;
}

export async function handleRequirementsTool(
  name: string,
  args: Record<string, unknown>,
  bridge: ReplBridge,
) {
  const method = toolMethodMap[name];
  if (!method) throw new Error(`Unknown requirements tool: ${name}`);

  const response = await bridge.invoke(method, args);

  if (response.type === 'error') {
    const payload = response.payload as { message?: string; code?: string };
    throw new Error(`${payload.code ?? 'error'}: ${payload.message ?? 'Unknown error'}`);
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response.payload, null, 2) }],
  };
}
