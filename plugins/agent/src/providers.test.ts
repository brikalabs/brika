import { describe, expect, it } from 'bun:test';
import { readAnthropicTurn, readOpenAiTurn } from './providers';

describe('readAnthropicTurn', () => {
  it('parses usage including cached reads', () => {
    const turn = readAnthropicTurn({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 },
    });
    expect(turn.text).toBe('hello');
    expect(turn.usage).toEqual({ inputTokens: 10, outputTokens: 5, cachedInputTokens: 3 });
  });

  it('leaves usage undefined when the response omits it', () => {
    const turn = readAnthropicTurn({ content: [{ type: 'text', text: 'hi' }] });
    expect(turn.usage).toBeUndefined();
  });

  it('still extracts tool calls alongside usage', () => {
    const turn = readAnthropicTurn({
      content: [{ type: 'tool_use', id: 'tu_1', name: 'search', input: { q: 'x' } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(turn.toolCalls).toEqual([{ id: 'tu_1', name: 'search', args: { q: 'x' } }]);
    expect(turn.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
  });
});

describe('readOpenAiTurn', () => {
  it('parses prompt/completion tokens and cached detail', () => {
    const turn = readOpenAiTurn({
      choices: [{ message: { content: 'hello', tool_calls: [] } }],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 4,
        prompt_tokens_details: { cached_tokens: 2 },
      },
    });
    expect(turn.text).toBe('hello');
    expect(turn.usage).toEqual({ inputTokens: 8, outputTokens: 4, cachedInputTokens: 2 });
  });

  it('leaves usage undefined when a proxy omits the block', () => {
    const turn = readOpenAiTurn({ choices: [{ message: { content: 'hi' } }] });
    expect(turn.usage).toBeUndefined();
  });
});
