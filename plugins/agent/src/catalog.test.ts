import { describe, expect, it } from 'bun:test';
import {
  addUsage,
  costForUsage,
  describeModel,
  hintsForModel,
  modelSupportsThinking,
} from './catalog';

describe('hintsForModel', () => {
  it('returns exact hints for a known model', () => {
    const h = hintsForModel('claude-opus-4-8');
    expect(h.pricing).toEqual({ inputPerMTok: 5, outputPerMTok: 25, cachedInputPerMTok: 0.5 });
    expect(h.contextWindow).toBe(1_000_000);
    expect(h.supportsThinking).toBe(true);
  });

  it('falls back to the family prefix rule for a future point release', () => {
    const h = hintsForModel('claude-opus-4-9-20990101');
    expect(h.pricing?.inputPerMTok).toBe(5);
    expect(h.supportsThinking).toBe(true);
  });

  it('returns permissive defaults and no pricing for a fully unknown id', () => {
    const h = hintsForModel('some-local-model');
    expect(h.pricing).toBeUndefined();
    expect(h.supportsTools).toBe(true);
    expect(h.supportsThinking).toBe(false);
  });
});

describe('modelSupportsThinking', () => {
  it('is false for models where effort 400s', () => {
    expect(modelSupportsThinking('claude-haiku-4-5')).toBe(false);
    expect(modelSupportsThinking('claude-sonnet-4-5')).toBe(false);
    expect(modelSupportsThinking('gpt-4o')).toBe(false);
  });

  it('is true for adaptive-thinking models', () => {
    expect(modelSupportsThinking('claude-opus-4-8')).toBe(true);
    expect(modelSupportsThinking('claude-sonnet-4-6')).toBe(true);
  });
});

describe('costForUsage', () => {
  it('computes cost from catalog pricing', () => {
    const cost = costForUsage('claude-opus-4-8', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(30);
  });

  it('bills cached input at the cached rate', () => {
    const cost = costForUsage('claude-opus-4-8', {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 1_000_000,
    });
    expect(cost).toBe(0.5);
  });

  it('does not double-count cached input when no cached rate is modeled', () => {
    // OpenAI-style: prompt_tokens already includes cached; no cachedInputPerMTok.
    const cost = costForUsage('gpt-4o', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 500_000,
    });
    expect(cost).toBe(2.5);
  });

  it('returns undefined for an uncatalogued model (never a fake $0)', () => {
    expect(
      costForUsage('some-local-model', { inputTokens: 100, outputTokens: 100 })
    ).toBeUndefined();
  });

  it('prefers a live pricing override when supplied', () => {
    const cost = costForUsage(
      'some-local-model',
      { inputTokens: 1_000_000, outputTokens: 0 },
      { inputPerMTok: 2, outputPerMTok: 4 }
    );
    expect(cost).toBe(2);
  });
});

describe('addUsage', () => {
  it('sums tokens', () => {
    expect(
      addUsage({ inputTokens: 1, outputTokens: 2 }, { inputTokens: 3, outputTokens: 4 })
    ).toEqual({
      inputTokens: 4,
      outputTokens: 6,
    });
  });

  it('keeps the cached field only when at least one side has it', () => {
    expect(
      addUsage(
        { inputTokens: 1, outputTokens: 2, cachedInputTokens: 5 },
        { inputTokens: 3, outputTokens: 4 }
      )
    ).toEqual({ inputTokens: 4, outputTokens: 6, cachedInputTokens: 5 });
  });
});

describe('describeModel', () => {
  it('formats a context-window and price summary', () => {
    expect(describeModel(hintsForModel('claude-opus-4-8'))).toBe('1M ctx | $5/$25 per Mtok');
  });

  it('returns undefined with no metadata to show', () => {
    expect(describeModel({ supportsTools: true, supportsThinking: false })).toBeUndefined();
  });
});
