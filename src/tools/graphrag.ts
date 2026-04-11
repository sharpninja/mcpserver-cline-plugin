import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ReplBridge } from '../transport/repl-bridge.js';

export const graphragTools: Tool[] = [
  // --- Status & Indexing ---
  {
    name: 'graphrag_status',
    description: 'Check whether GraphRAG is enabled, initialized, and indexed for the workspace.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'graphrag_index',
    description: 'Rebuild the GraphRAG index from the current corpus.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force rebuild even if no corpus changes detected' },
      },
    },
  },
  // --- Query ---
  {
    name: 'graphrag_query',
    description: 'Run a natural-language query against the indexed knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query' },
        mode: { type: 'string', enum: ['local', 'global', 'drift'], description: 'Query mode (default: local)' },
        maxChunks: { type: 'number', description: 'Max text chunks to include (default: 10)' },
        includeContextChunks: { type: 'boolean' },
        maxEntities: { type: 'number' },
        maxRelationships: { type: 'number' },
        communityDepth: { type: 'number' },
        responseTokenBudget: { type: 'number' },
      },
      required: ['query'],
    },
  },
  // --- Ingestion ---
  {
    name: 'graphrag_ingest',
    description: 'Add raw text to the GraphRAG corpus without triggering a full reindex.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text content to ingest' },
        title: { type: 'string', description: 'Human-readable document name' },
        sourceType: { type: 'string', description: 'Classification tag (default: adhoc-text)' },
        sourceKey: { type: 'string', description: 'Unique path/key for the document' },
        triggerReindex: { type: 'boolean', description: 'Trigger full reindex after ingestion' },
      },
      required: ['content'],
    },
  },
  // --- Document Management ---
  {
    name: 'graphrag_doc_list',
    description: 'Paginate corpus documents by sourceType.',
    inputSchema: {
      type: 'object',
      properties: {
        skip: { type: 'number', description: 'Pagination offset' },
        take: { type: 'number', description: 'Page size (default: 50)' },
        sourceType: { type: 'string', description: 'Filter by source type' },
      },
    },
  },
  {
    name: 'graphrag_doc_chunks',
    description: 'Inspect the text chunks of a specific document.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Document ID (e.g. doc-a1b2c3d4)' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'graphrag_doc_delete',
    description: 'Remove a document and all its chunks from the corpus.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
      },
      required: ['documentId'],
    },
  },
  // --- Entity Management ---
  {
    name: 'graphrag_entity_create',
    description: 'Create a named graph entity (component, concept, person, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Entity name' },
        entityType: { type: 'string', description: 'Entity type (e.g. component, concept, person)' },
        description: { type: 'string' },
        metadata: { type: 'string', description: 'JSON string of additional metadata' },
      },
      required: ['name', 'entityType'],
    },
  },
  {
    name: 'graphrag_entity_list',
    description: 'Paginate graph entities with optional type filter.',
    inputSchema: {
      type: 'object',
      properties: {
        skip: { type: 'number' },
        take: { type: 'number' },
        entityType: { type: 'string', description: 'Filter by entity type' },
      },
    },
  },
  {
    name: 'graphrag_entity_get',
    description: 'Fetch a single graph entity by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity ID (e.g. ent-001)' },
      },
      required: ['entityId'],
    },
  },
  {
    name: 'graphrag_entity_update',
    description: 'Replace an entity (full body, not patch). Supply all fields.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        name: { type: 'string' },
        entityType: { type: 'string' },
        description: { type: 'string' },
        metadata: { type: 'string' },
      },
      required: ['entityId', 'name', 'entityType'],
    },
  },
  {
    name: 'graphrag_entity_delete',
    description: 'Remove a graph entity. Delete related relationships separately first.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
      },
      required: ['entityId'],
    },
  },
  // --- Relationship Management ---
  {
    name: 'graphrag_rel_create',
    description: 'Create a directed relationship between two graph entities.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceEntityId: { type: 'string' },
        targetEntityId: { type: 'string' },
        relationshipType: { type: 'string', description: 'Relationship type (e.g. validates, calls, implements)' },
        description: { type: 'string' },
        weight: { type: 'number', description: 'Edge weight (default: 1.0)' },
        metadata: { type: 'string', description: 'JSON string of additional metadata' },
      },
      required: ['sourceEntityId', 'targetEntityId', 'relationshipType'],
    },
  },
  {
    name: 'graphrag_rel_list',
    description: 'Paginate relationships with optional entityId or type filter.',
    inputSchema: {
      type: 'object',
      properties: {
        skip: { type: 'number' },
        take: { type: 'number' },
        entityId: { type: 'string', description: 'Filter to relationships involving this entity' },
        type: { type: 'string', description: 'Filter by relationship type' },
      },
    },
  },
  {
    name: 'graphrag_rel_get',
    description: 'Fetch a single relationship by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        relationshipId: { type: 'string', description: 'Relationship ID (e.g. rel-001)' },
      },
      required: ['relationshipId'],
    },
  },
  {
    name: 'graphrag_rel_update',
    description: 'Replace a relationship (full body, not patch). Supply all fields.',
    inputSchema: {
      type: 'object',
      properties: {
        relationshipId: { type: 'string' },
        sourceEntityId: { type: 'string' },
        targetEntityId: { type: 'string' },
        relationshipType: { type: 'string' },
        description: { type: 'string' },
        weight: { type: 'number' },
        metadata: { type: 'string' },
      },
      required: ['relationshipId', 'sourceEntityId', 'targetEntityId', 'relationshipType'],
    },
  },
  {
    name: 'graphrag_rel_delete',
    description: 'Remove a graph relationship.',
    inputSchema: {
      type: 'object',
      properties: {
        relationshipId: { type: 'string' },
      },
      required: ['relationshipId'],
    },
  },
];

const toolMethodMap: Record<string, string> = {
  graphrag_status: 'workflow.graphrag.status',
  graphrag_index: 'workflow.graphrag.index',
  graphrag_query: 'workflow.graphrag.query',
  graphrag_ingest: 'workflow.graphrag.ingest',
  graphrag_doc_list: 'workflow.graphrag.documents.list',
  graphrag_doc_chunks: 'workflow.graphrag.documents.chunks',
  graphrag_doc_delete: 'workflow.graphrag.documents.delete',
  graphrag_entity_create: 'workflow.graphrag.entities.create',
  graphrag_entity_list: 'workflow.graphrag.entities.list',
  graphrag_entity_get: 'workflow.graphrag.entities.get',
  graphrag_entity_update: 'workflow.graphrag.entities.update',
  graphrag_entity_delete: 'workflow.graphrag.entities.delete',
  graphrag_rel_create: 'workflow.graphrag.relationships.create',
  graphrag_rel_list: 'workflow.graphrag.relationships.list',
  graphrag_rel_get: 'workflow.graphrag.relationships.get',
  graphrag_rel_update: 'workflow.graphrag.relationships.update',
  graphrag_rel_delete: 'workflow.graphrag.relationships.delete',
};

export function canHandleGraphragTool(name: string): boolean {
  return name in toolMethodMap;
}

export async function handleGraphragTool(
  name: string,
  args: Record<string, unknown>,
  bridge: ReplBridge,
) {
  const method = toolMethodMap[name];
  if (!method) throw new Error(`Unknown graphrag tool: ${name}`);

  const response = await bridge.invoke(method, args);

  if (response.type === 'error') {
    const payload = response.payload as { message?: string; code?: string };
    throw new Error(`${payload.code ?? 'error'}: ${payload.message ?? 'Unknown error'}`);
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response.payload, null, 2) }],
  };
}
