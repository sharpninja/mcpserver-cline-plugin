import { requirementsTools, handleRequirementsTool } from '../src/tools/requirements.js';
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

function tool(name: string) {
  const found = requirementsTools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

describe('requirements tool schemas', () => {
  test('req_generate_document exposes wiki format and all docType', () => {
    const schema = tool('req_generate_document').inputSchema as unknown as {
      properties: {
        format: { enum: string[] };
        docType: { enum: string[] };
      };
    };

    expect(schema.properties.format.enum).toEqual(['markdown', 'yaml', 'wiki']);
    expect(schema.properties.docType.enum).toContain('all');
  });

  test('req_ingest_document exposes wiki source selection and document map fields', () => {
    const schema = tool('req_ingest_document').inputSchema as unknown as {
      properties: Record<string, unknown>;
      required?: string[];
    };

    expect(schema.properties).toHaveProperty('documents');
    expect(schema.properties).toHaveProperty('sourceFormat');
    expect(schema.properties).toHaveProperty('preferredWikiFormat');
    expect(schema.required).toBeUndefined();
  });
});

describe('handleRequirementsTool', () => {
  test('routes wiki generate arguments through workflow.requirements.generateDocument', async () => {
    const fake = new FakeBridge();
    await handleRequirementsTool(
      'req_generate_document',
      { format: 'wiki', docType: 'all' },
      asBridge(fake),
    );

    expect(fake.calls).toEqual([
      {
        method: 'workflow.requirements.generateDocument',
        params: { format: 'wiki', docType: 'all' },
      },
    ]);
  });

  test('routes wiki ingest documents through workflow.requirements.ingestDocument', async () => {
    const fake = new FakeBridge();
    const params = {
      format: 'wiki',
      sourceFormat: 'wiki',
      preferredWikiFormat: 'github',
      documents: {
        'github/Functional-Requirements.md': {
          content: '# Functional Requirements (MCP Server)',
          lastModifiedUtc: '2026-05-08T12:00:00Z',
        },
      },
    };

    await handleRequirementsTool('req_ingest_document', params, asBridge(fake));

    expect(fake.calls).toEqual([
      {
        method: 'workflow.requirements.ingestDocument',
        params,
      },
    ]);
  });
});
