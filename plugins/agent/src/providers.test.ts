import { describe, expect, it } from 'bun:test';
import {
  ollamaModelOption,
  ollamaRoot,
  openAiModelOption,
  openRouterPricing,
  readAnthropicTurn,
  readOllamaTurn,
  readOpenAiTurn,
  resolveModel,
} from './providers';

describe('ollamaRoot', () => {
  it('strips a trailing slash run and a /v1 suffix', () => {
    expect(ollamaRoot('http://localhost:11434')).toBe('http://localhost:11434');
    expect(ollamaRoot('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(ollamaRoot('http://localhost:11434///')).toBe('http://localhost:11434');
    expect(ollamaRoot('http://localhost:11434/v1')).toBe('http://localhost:11434');
    expect(ollamaRoot('http://localhost:11434/v1/')).toBe('http://localhost:11434');
    expect(ollamaRoot('http://localhost:11434/v1//')).toBe('http://localhost:11434');
  });

  it('only strips slashes at the very end (leaves internal slashes intact)', () => {
    expect(ollamaRoot('http://host/ollama')).toBe('http://host/ollama');
    expect(ollamaRoot('http://host/ollama/')).toBe('http://host/ollama');
    // /v1 is stripped after the trailing-slash pass, exposing a now-trailing slash.
    expect(ollamaRoot('http://host//v1')).toBe('http://host/');
  });

  it('handles an all-slashes input without leaving a leading boundary char', () => {
    expect(ollamaRoot('///')).toBe('');
    expect(ollamaRoot('/')).toBe('');
  });
});

describe('resolveModel', () => {
  it('splits a provider-qualified ref on the first colon only', () => {
    expect(resolveModel('anthropic:claude-opus-4-8')).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
    });
    expect(resolveModel('ollama:llama3.1:8b')).toEqual({
      provider: 'ollama',
      model: 'llama3.1:8b',
    });
    expect(resolveModel('openai:openai/gpt-4o')).toEqual({
      provider: 'openai',
      model: 'openai/gpt-4o',
    });
  });

  it('treats a bare or unknown-prefixed id as Anthropic (escape hatch)', () => {
    expect(resolveModel('claude-opus-4-8')).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
    });
    expect(resolveModel('llama3.1:8b')).toEqual({ provider: 'anthropic', model: 'llama3.1:8b' });
  });
});

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

describe('readOllamaTurn', () => {
  it('parses text, native tool calls (object args), and eval-count usage', () => {
    const turn = readOllamaTurn({
      message: {
        role: 'assistant',
        content: 'checking',
        tool_calls: [
          { function: { name: 'get_weather', arguments: { city: 'Bern' } } },
          { function: { name: 'get_time', arguments: {} } },
        ],
      },
      prompt_eval_count: 12,
      eval_count: 7,
    });
    expect(turn.text).toBe('checking');
    expect(turn.toolCalls).toEqual([
      { id: 'ollama-call-0', name: 'get_weather', args: { city: 'Bern' } },
      { id: 'ollama-call-1', name: 'get_time', args: {} },
    ]);
    expect(turn.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it('leaves usage undefined when eval counts are missing', () => {
    const turn = readOllamaTurn({ message: { role: 'assistant', content: 'hi' } });
    expect(turn.text).toBe('hi');
    expect(turn.toolCalls).toEqual([]);
    expect(turn.usage).toBeUndefined();
  });

  it('prefers the native call id when Ollama returns one', () => {
    const turn = readOllamaTurn({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_jgel4xd6', function: { name: 'list_lights', arguments: {} } }],
      },
    });
    expect(turn.toolCalls).toEqual([{ id: 'call_jgel4xd6', name: 'list_lights', args: {} }]);
  });
});

describe('ollamaModelOption', () => {
  it('normalizes an /api/tags entry with size metadata', () => {
    const opt = ollamaModelOption({
      name: 'llama3.1:8b',
      size: 4_900_000_000,
      details: { parameter_size: '8.0B' },
    });
    expect(opt?.value).toBe('llama3.1:8b');
    expect(opt?.label).toBe('llama3.1:8b');
    expect(opt?.description).toBe('8.0B | 4.9 GB | free');
  });

  it('degrades to a bare free label without metadata', () => {
    expect(ollamaModelOption({ name: 'tiny' })?.description).toBe('free');
    expect(ollamaModelOption({})).toBeNull();
    expect(ollamaModelOption(null)).toBeNull();
  });
});

describe('openRouterPricing', () => {
  it('converts per-token USD strings to per-MTok', () => {
    expect(openRouterPricing({ prompt: '0.000005', completion: '0.000025' })).toEqual({
      inputPerMTok: 5,
      outputPerMTok: 25,
    });
  });

  it('returns undefined for free (0/0) or non-numeric pricing', () => {
    expect(openRouterPricing({ prompt: '0', completion: '0' })).toBeUndefined();
    expect(openRouterPricing({ prompt: 'x', completion: 'y' })).toBeUndefined();
    expect(openRouterPricing(null)).toBeUndefined();
  });
});

describe('openAiModelOption', () => {
  it('normalizes a bare OpenAI entry via catalog hints', () => {
    const opt = openAiModelOption({ id: 'gpt-4o' });
    expect(opt?.value).toBe('gpt-4o');
    expect(opt?.label).toBe('GPT-4o');
  });

  it('prefers live name / context / pricing for a rich (OpenRouter) entry', () => {
    const opt = openAiModelOption({
      id: 'x/y',
      name: 'Model Y',
      context_length: 32000,
      pricing: { prompt: '0.000001', completion: '0.000002' },
    });
    expect(opt?.value).toBe('x/y');
    expect(opt?.label).toBe('Model Y');
    expect(opt?.description).toContain('32K ctx');
    expect(opt?.description).toContain('$1/$2 per Mtok');
  });

  it('returns null for an entry without an id', () => {
    expect(openAiModelOption({})).toBeNull();
    expect(openAiModelOption(null)).toBeNull();
  });
});
