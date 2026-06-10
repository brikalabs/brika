import { describe, expect, it, mock } from 'bun:test';
import type { Json } from '@brika/sdk';
import { runToolCalls } from './agent';

const nameToId = new Map([['matter_list-devices', '@brika/plugin-matter:list-devices']]);

function fakeCallTool(content: string) {
  return mock((_tool: string, _args: Record<string, Json>) =>
    Promise.resolve({ ok: true, content })
  );
}

describe('runToolCalls loop guard', () => {
  it('executes a fresh call and reports its signature', async () => {
    const callTool = fakeCallTool('{"devices":[]}');
    const onToolCall = mock(() => undefined);
    const { results, signatures } = await runToolCalls(
      [{ id: 'c1', name: 'matter_list-devices', args: {} }],
      nameToId,
      callTool,
      onToolCall,
      new Set<string>()
    );
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(results[0]?.content).toBe('{"devices":[]}');
    expect(signatures.size).toBe(1);
  });

  it('nudges instead of re-executing an identical call from the previous turn', async () => {
    const callTool = fakeCallTool('{"devices":[]}');
    const first = await runToolCalls(
      [{ id: 'c1', name: 'matter_list-devices', args: {} }],
      nameToId,
      callTool,
      () => undefined,
      new Set<string>()
    );
    const second = await runToolCalls(
      [{ id: 'c2', name: 'matter_list-devices', args: {} }],
      nameToId,
      callTool,
      () => undefined,
      first.signatures
    );
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(second.results[0]?.content).toContain('Do not repeat the call');
  });

  it('still executes the same tool when the arguments differ', async () => {
    const callTool = fakeCallTool('ok');
    const ids = new Map([['control', 'matter:control-device']]);
    const first = await runToolCalls(
      [{ id: 'c1', name: 'control', args: { nodeId: '1:2', command: 'off' } }],
      ids,
      callTool,
      () => undefined,
      new Set<string>()
    );
    await runToolCalls(
      [{ id: 'c2', name: 'control', args: { nodeId: '1:3', command: 'off' } }],
      ids,
      callTool,
      () => undefined,
      first.signatures
    );
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('reports unknown tools without executing anything', async () => {
    const callTool = fakeCallTool('never');
    const { results } = await runToolCalls(
      [{ id: 'c1', name: 'nope', args: {} }],
      nameToId,
      callTool,
      () => undefined,
      new Set<string>()
    );
    expect(callTool).toHaveBeenCalledTimes(0);
    expect(results[0]?.content).toBe('Unknown tool: nope');
  });
});
