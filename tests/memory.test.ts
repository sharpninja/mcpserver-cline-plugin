import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ReplBridge } from '../src/transport/repl-bridge.js';

describe('memory tool handlers', () => {
  let failsafeDir: string;

  beforeEach(() => {
    failsafeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
    process.env.MCPSERVER_FAILSAFE_DIR = failsafeDir;
  });

  afterEach(() => {
    delete process.env.MCPSERVER_FAILSAFE_DIR;
    fs.rmSync(failsafeDir, { recursive: true, force: true });
  });

  test('canHandleMemoryTool covers all memory names', async () => {
    const { canHandleMemoryTool } = await import('../src/tools/memory.js');
    expect(canHandleMemoryTool('memory_list')).toBe(true);
    expect(canHandleMemoryTool('memory_get')).toBe(true);
    expect(canHandleMemoryTool('memory_add')).toBe(true);
    expect(canHandleMemoryTool('memory_update')).toBe(true);
    expect(canHandleMemoryTool('memory_remove')).toBe(true);
    expect(canHandleMemoryTool('memory_missing')).toBe(false);
  });

  test('memory_list routes through workflow.memory.list', async () => {
    const { handleMemoryTool, memoryTools } = await import('../src/tools/memory.js');
    const bridge = {
      invoke: jest.fn(async () => ({
        type: 'result',
        payload: { result: { items: [{ id: 'MEMORY-REQ-001', text: 'Keep exact wording.' }] } },
      })),
    } as unknown as ReplBridge;

    const result = await handleMemoryTool('memory_list', { scope: 'Effective' }, bridge);

    expect(memoryTools.map((tool) => tool.name)).toContain('memory_add');
    expect(bridge.invoke).toHaveBeenCalledWith('workflow.memory.list', { scope: 'Effective' });
    expect(result.content[0].text).toContain('MEMORY-REQ-001');
  });

  test('memory_add appends a session-log action and clears mutation failsafe after success', async () => {
    const { handleMemoryTool } = await import('../src/tools/memory.js');
    const bridge = {
      invoke: jest.fn(async () => ({
        type: 'result',
        payload: { result: { id: 'MEMORY-REQ-001', success: true } },
      })),
    } as unknown as ReplBridge;

    const result = await handleMemoryTool(
      'memory_add',
      { request: { id: 'MEMORY-REQ-001', category: 'REQ', text: 'Keep exact wording.', scope: 'Workspace' } },
      bridge,
    );

    expect(bridge.invoke).toHaveBeenNthCalledWith(1, 'workflow.memory.add', {
      id: 'MEMORY-REQ-001',
      category: 'REQ',
      text: 'Keep exact wording.',
      scope: 'Workspace',
    });
    expect(bridge.invoke).toHaveBeenNthCalledWith(2, 'workflow.sessionlog.appendActions', {
      actions: [
        {
          description: 'Memory add MEMORY-REQ-001',
          type: 'edit',
          status: 'completed',
        },
      ],
    });
    expect(result.content[0].text).toContain('MEMORY-REQ-001');
    expect(fs.readdirSync(failsafeDir)).toEqual([]);
  });
});
