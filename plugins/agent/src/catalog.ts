/**
 * Model capability + pricing hints.
 *
 * The selectable model LIST is fetched live per provider (see `listModels` in
 * providers.ts): the picker always shows what the provider actually serves.
 * The live `/models` endpoints, though, return little beyond the id, so this
 * module enriches a model id with the data they omit: a friendly display name,
 * the context window, which knobs the model accepts (tools, adaptive thinking /
 * effort), and a per-million-token price for cost math.
 *
 * Lookups degrade gracefully: an uncatalogued id resolves to permissive
 * capabilities and no pricing (cost then reports "unavailable", never a fake
 * $0). Hosted providers that DO return pricing live (OpenRouter) override these
 * hints at fetch time, so this map is a floor, not the source of truth.
 */

/** Per-million-token prices in USD. Cost shown to the user is always an estimate. */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Set when the provider bills cached-read input separately (e.g. Anthropic). */
  cachedInputPerMTok?: number;
}

/** Token counts for one chat turn; any field a provider omits stays undefined. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

/** What the picker and the request-shaper need to know about a model id. */
export interface ModelHints {
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  /** Whether the model accepts tool definitions (the agent loop needs this). */
  supportsTools: boolean;
  /** Whether the model accepts Anthropic adaptive thinking + the effort knob. */
  supportsThinking: boolean;
  pricing?: ModelPricing;
}

/** A model the user can pick. `value` is the id sent to the provider. */
export interface ModelOption {
  value: string;
  label: string;
  /** Secondary line shown under the label (context window, price). */
  description?: string;
  contextWindow?: number;
  pricing?: ModelPricing;
}

const OPUS: ModelPricing = { inputPerMTok: 5, outputPerMTok: 25, cachedInputPerMTok: 0.5 };
const SONNET: ModelPricing = { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 };
const HAIKU: ModelPricing = { inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1 };

/**
 * Exact-id hints for well-known models. Anthropic ids are precise (verified
 * against the model catalog); a few OpenAI ids are included as estimates since
 * their `/models` endpoint returns no pricing. Anything else falls through to
 * the prefix rules below.
 */
const EXACT_HINTS: Record<string, ModelHints> = {
  'claude-opus-4-8': mk('Claude Opus 4.8', 1_000_000, 128_000, true, OPUS),
  'claude-opus-4-7': mk('Claude Opus 4.7', 1_000_000, 128_000, true, OPUS),
  'claude-opus-4-6': mk('Claude Opus 4.6', 1_000_000, 128_000, true, OPUS),
  'claude-opus-4-5': mk('Claude Opus 4.5', 200_000, 64_000, true, OPUS),
  'claude-sonnet-4-6': mk('Claude Sonnet 4.6', 1_000_000, 64_000, true, SONNET),
  'claude-sonnet-4-5': mk('Claude Sonnet 4.5', 1_000_000, 64_000, false, SONNET),
  'claude-haiku-4-5': mk('Claude Haiku 4.5', 200_000, 64_000, false, HAIKU),
  'gpt-4o': mk('GPT-4o', 128_000, 16_384, false, { inputPerMTok: 2.5, outputPerMTok: 10 }),
  'gpt-4o-mini': mk('GPT-4o mini', 128_000, 16_384, false, {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
  }),
};

/** Prefix rules let new point releases inherit a family's price/capabilities. */
const PREFIX_HINTS: Array<{ prefix: string; hints: ModelHints }> = [
  { prefix: 'claude-opus-', hints: mk(undefined, 1_000_000, 128_000, true, OPUS) },
  { prefix: 'claude-sonnet-', hints: mk(undefined, 1_000_000, 64_000, true, SONNET) },
  { prefix: 'claude-haiku-', hints: mk(undefined, 200_000, 64_000, false, HAIKU) },
];

function mk(
  displayName: string | undefined,
  contextWindow: number,
  maxOutputTokens: number,
  supportsThinking: boolean,
  pricing: ModelPricing
): ModelHints {
  return {
    displayName,
    contextWindow,
    maxOutputTokens,
    supportsTools: true,
    supportsThinking,
    pricing,
  };
}

/** Resolve a model id to its hints, falling back to permissive defaults. */
export function hintsForModel(modelId: string): ModelHints {
  const exact = EXACT_HINTS[modelId];
  if (exact) {
    return exact;
  }
  for (const rule of PREFIX_HINTS) {
    if (modelId.startsWith(rule.prefix)) {
      return rule.hints;
    }
  }
  return { supportsTools: true, supportsThinking: false };
}

/** True when sending Anthropic `thinking`/`effort` to this model is safe. */
export function modelSupportsThinking(modelId: string): boolean {
  return hintsForModel(modelId).supportsThinking;
}

/** Estimated USD cost for one usage record, or undefined when price is unknown. */
export function costForUsage(
  modelId: string,
  usage: TokenUsage,
  pricing?: ModelPricing
): number | undefined {
  const price = pricing ?? hintsForModel(modelId).pricing;
  if (!price) {
    return undefined;
  }
  const cached = usage.cachedInputTokens ?? 0;
  const cachedRate = price.cachedInputPerMTok ?? price.inputPerMTok;
  return (
    (usage.inputTokens / 1_000_000) * price.inputPerMTok +
    (cached / 1_000_000) * cachedRate +
    (usage.outputTokens / 1_000_000) * price.outputPerMTok
  );
}

/** Add two usage records, summing the optional cached field only when present. */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const cached =
    a.cachedInputTokens !== undefined || b.cachedInputTokens !== undefined
      ? (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0)
      : undefined;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    ...(cached !== undefined ? { cachedInputTokens: cached } : {}),
  };
}

/** Compact secondary-line label, e.g. "1M ctx | $5/$25 per Mtok". */
export function describeModel(hints: ModelHints): string | undefined {
  const parts: string[] = [];
  if (hints.contextWindow) {
    parts.push(`${formatContext(hints.contextWindow)} ctx`);
  }
  if (hints.pricing) {
    parts.push(`$${hints.pricing.inputPerMTok}/$${hints.pricing.outputPerMTok} per Mtok`);
  }
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${tokens / 1_000_000}M`;
  }
  if (tokens >= 1_000) {
    return `${tokens / 1_000}K`;
  }
  return String(tokens);
}
