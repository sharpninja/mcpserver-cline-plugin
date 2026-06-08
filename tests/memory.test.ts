import { jest } from '@jest/globals';
import type { ReplBridge } from '../src/transport/repl-bridge.js';

describe('memory tool handlers', () => {
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
});
