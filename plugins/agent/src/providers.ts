import { getPreferences, type Json, localFetch, z } from '@brika/sdk';
import {
  describeModel,
  hintsForModel,
  type ModelHints,
  type ModelOption,
  type ModelPricing,
  modelSupportsThinking,
  type TokenUsage,
} from './catalog';

/**
 * LLM provider abstraction.
 *
 * The agent loop and the simple chat block talk to this normalized interface,
 * never to a vendor API directly. Each provider translates the normalized
 * conversation (`ChatMessage[]` + `ChatTool[]`) into its own wire format, makes
 * one round-trip, and translates the reply back into a `ChatTurn`.
 *
 * Three providers ship: Anthropic (Messages API), any OpenAI-compatible
 * chat-completions endpoint (OpenAI, OpenRouter, Groq, Together, Mistral, Azure
 * OpenAI), and Ollama. The Ollama provider speaks Ollama's NATIVE API
 * (`/api/chat` + `/api/tags`), which carries tool calls (argument objects, not
 * JSON strings), token counts (`prompt_eval_count`/`eval_count`), and the
 * installed-model list with size metadata, none of which the OpenAI-compat
 * shim exposes reliably. It egresses through the `dev.brika.net.local.fetch`
 * grant (consented loopback ports) instead of the public `dev.brika.net.fetch`
 * grant, whose SSRF guard blocks loopback.
 *
 * Hosted keys come from plugin-global password preferences (`anthropicApiKey`,
 * `openaiApiKey`); Ollama needs no key.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Normalized model
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatTool {
  name: string;
  description: string;
  inputSchema: Json;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, Json>;
}

export interface ToolResult {
  id: string;
  content: string;
}

export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };

export interface ChatRequest {
  system?: string;
  messages: ChatMessage[];
  tools: ChatTool[];
  model: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
}

export interface ChatTurn {
  /** Assistant text (may be empty when the turn is purely tool calls). */
  text: string;
  /** Requested tool calls; empty means the assistant is done. */
  toolCalls: ToolCall[];
  /**
   * Token usage for this turn when the provider reports it. Optional because
   * many OpenAI-compatible proxies omit the `usage` block; a missing value
   * means "unavailable", never zero.
   */
  usage?: TokenUsage;
}

export interface LlmProvider {
  readonly label: string;
  chat(req: ChatRequest): Promise<ChatTurn>;
}

export type ProviderId = 'anthropic' | 'openai' | 'ollama';

export interface ProviderSettings {
  provider: ProviderId;
  /**
   * Base URL. For `openai`, the OpenAI-compatible endpoint (e.g.
   * https://openrouter.ai/api/v1). For `ollama`, the server root
   * (defaults to http://localhost:11434).
   */
  baseUrl?: string;
}

interface AgentPreferences {
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON navigation (curated z lacks z.json; JSON.parse widens any -> Json)
// ─────────────────────────────────────────────────────────────────────────────

function parseJson(text: string): Json {
  return JSON.parse(text);
}
function jsonObj(value: Json | undefined): Record<string, Json> | null {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}
function jsonArr(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}
function jsonStr(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function jsonNum(value: Json | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
/** Parse a tool-argument JSON string into a JSON object (empty on failure). */
function parseArgs(text: string | undefined): Record<string, Json> {
  if (!text) {
    return {};
  }
  try {
    return jsonObj(parseJson(text)) ?? {};
  } catch {
    return {};
  }
}

async function postJson(url: string, headers: Record<string, string>, body: Json): Promise<Json> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
  }
  return parseJson(await res.text());
}

async function getJson(url: string, headers: Record<string, string>): Promise<Json> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Model list request failed (${res.status}): ${await res.text()}`);
  }
  return parseJson(await res.text());
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic provider (Messages API)
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models?limit=1000';
const ANTHROPIC_VERSION = '2023-06-01';

function anthropicContent(message: ChatMessage): Json {
  if (message.role === 'user') {
    return message.text;
  }
  if (message.role === 'assistant') {
    const blocks: Json[] = [];
    if (message.text) {
      blocks.push({ type: 'text', text: message.text });
    }
    for (const call of message.toolCalls) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
    }
    return blocks;
  }
  return message.results.map((result) => ({
    type: 'tool_result',
    tool_use_id: result.id,
    content: result.content,
  }));
}

function createAnthropicProvider(): LlmProvider {
  return {
    label: 'Anthropic',
    async chat(req) {
      const { anthropicApiKey } = getPreferences<AgentPreferences>();
      if (!anthropicApiKey) {
        throw new Error('Set the Anthropic API key in the AI Agent plugin settings');
      }
      const messages = req.messages.map((message) => ({
        role: message.role === 'tool' ? 'user' : message.role,
        content: anthropicContent(message),
      }));
      const tools = req.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
      // Adaptive thinking + the effort knob 400 on models that do not support
      // them (Haiku 4.5, Sonnet 4.5). Send them only when the model does.
      const thinks = modelSupportsThinking(req.model);
      const data = await postJson(
        ANTHROPIC_URL,
        { 'x-api-key': anthropicApiKey, 'anthropic-version': ANTHROPIC_VERSION },
        {
          model: req.model,
          max_tokens: req.maxTokens,
          thinking: thinks ? { type: 'adaptive' } : undefined,
          output_config: thinks ? { effort: req.effort } : undefined,
          system: req.system,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        }
      );
      return readAnthropicTurn(data);
    },
  };
}

export function readAnthropicTurn(data: Json): ChatTurn {
  const content = jsonArr(jsonObj(data)?.content);
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of content) {
    const b = jsonObj(block);
    if (!b) {
      continue;
    }
    const type = jsonStr(b.type);
    if (type === 'text') {
      text += jsonStr(b.text) ?? '';
    } else if (type === 'tool_use') {
      toolCalls.push({
        id: jsonStr(b.id) ?? '',
        name: jsonStr(b.name) ?? '',
        args: jsonObj(b.input) ?? {},
      });
    }
  }
  return { text, toolCalls, usage: readAnthropicUsage(data) };
}

function readAnthropicUsage(data: Json): TokenUsage | undefined {
  const usage = jsonObj(jsonObj(data)?.usage);
  if (!usage) {
    return undefined;
  }
  const inputTokens = jsonNum(usage.input_tokens);
  const outputTokens = jsonNum(usage.output_tokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  const cached = jsonNum(usage.cache_read_input_tokens);
  return {
    inputTokens,
    outputTokens,
    ...(cached === undefined ? {} : { cachedInputTokens: cached }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible provider (chat/completions)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';
/** Ollama server root (the native API lives under /api). */
const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';

/** Normalize a user-pasted Ollama base: strip trailing slash and a /v1 suffix. */
function ollamaRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
}

function openaiMessages(req: ChatRequest): Json[] {
  const out: Json[] = [];
  if (req.system) {
    out.push({ role: 'system', content: req.system });
  }
  for (const message of req.messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text });
    } else if (message.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: message.text.length > 0 ? message.text : null,
        tool_calls:
          message.toolCalls.length > 0
            ? message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              }))
            : undefined,
      });
    } else {
      for (const result of message.results) {
        out.push({ role: 'tool', tool_call_id: result.id, content: result.content });
      }
    }
  }
  return out;
}

/** OpenAI-compatible provider (OpenAI, OpenRouter, Groq, Together, Mistral, Azure). */
function createOpenAiProvider(baseUrl: string): LlmProvider {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return {
    label: 'OpenAI-compatible',
    async chat(req) {
      const { openaiApiKey } = getPreferences<AgentPreferences>();
      if (!openaiApiKey) {
        throw new Error('Set the OpenAI API key in the AI Agent plugin settings');
      }
      const tools = req.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      const data = await postJson(
        endpoint,
        { authorization: `Bearer ${openaiApiKey}` },
        {
          model: req.model,
          max_tokens: req.maxTokens,
          messages: openaiMessages(req),
          tools: tools.length > 0 ? tools : undefined,
        }
      );
      return readOpenAiTurn(data);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama provider (native API over the consented net.local grant)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize the normalized conversation to Ollama's native /api/chat shape.
 * Differences from OpenAI: assistant tool-call arguments are OBJECTS (not JSON
 * strings), tool calls carry no ids (results are matched by order), and tool
 * results are plain `{ role: 'tool', content }` messages.
 */
function ollamaMessages(req: ChatRequest): Json[] {
  const out: Json[] = [];
  if (req.system) {
    out.push({ role: 'system', content: req.system });
  }
  for (const message of req.messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text });
    } else if (message.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: message.text,
        tool_calls:
          message.toolCalls.length > 0
            ? message.toolCalls.map((call) => ({
                function: { name: call.name, arguments: call.args },
              }))
            : undefined,
      });
    } else {
      for (const result of message.results) {
        out.push({ role: 'tool', content: result.content });
      }
    }
  }
  return out;
}

/**
 * Dedicated Ollama provider. Uses the native API so tool calling and token
 * counts work as Ollama implements them: `/api/chat` accepts the same
 * function-tool declarations as OpenAI but returns argument objects, and the
 * response carries `prompt_eval_count`/`eval_count` for usage. Tool-call ids
 * are synthesized (Ollama matches results by order, the agent loop by id).
 */
function createOllamaProvider(baseUrl: string): LlmProvider {
  const endpoint = `${ollamaRoot(baseUrl)}/api/chat`;
  return {
    label: 'Ollama',
    async chat(req) {
      const tools = req.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      const data = await localPostJson(endpoint, {
        model: req.model,
        stream: false,
        messages: ollamaMessages(req),
        tools: tools.length > 0 ? tools : undefined,
        options: { num_predict: req.maxTokens },
      });
      return readOllamaTurn(data);
    },
  };
}

export function readOllamaTurn(data: Json): ChatTurn {
  const message = jsonObj(jsonObj(data)?.message);
  const text = jsonStr(message?.content) ?? '';
  const toolCalls: ToolCall[] = [];
  for (const raw of jsonArr(message?.tool_calls)) {
    const fn = jsonObj(jsonObj(raw)?.function);
    if (!fn) {
      continue;
    }
    toolCalls.push({
      id: `ollama-call-${toolCalls.length}`,
      name: jsonStr(fn.name) ?? '',
      args: jsonObj(fn.arguments) ?? {},
    });
  }
  return { text, toolCalls, usage: readOllamaUsage(data) };
}

function readOllamaUsage(data: Json): TokenUsage | undefined {
  const obj = jsonObj(data);
  const inputTokens = jsonNum(obj?.prompt_eval_count);
  const outputTokens = jsonNum(obj?.eval_count);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  return { inputTokens, outputTokens };
}

/** JSON POST over the loopback grant (the Ollama server on a consented port). */
async function localPostJson(url: string, body: Json): Promise<Json> {
  const res = await localFetch({
    url,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Ollama request failed (${res.status}): ${res.body}`);
  }
  return parseJson(res.body);
}

/** JSON GET over the loopback grant (used to list installed Ollama models). */
async function localGetJson(url: string): Promise<Json> {
  const res = await localFetch({ url });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Ollama model list request failed (${res.status}): ${res.body}`);
  }
  return parseJson(res.body);
}

export function readOpenAiTurn(data: Json): ChatTurn {
  const choice = jsonObj(jsonArr(jsonObj(data)?.choices)[0]);
  const message = jsonObj(choice?.message);
  const text = jsonStr(message?.content) ?? '';
  const toolCalls: ToolCall[] = [];
  for (const raw of jsonArr(message?.tool_calls)) {
    const call = jsonObj(raw);
    const fn = jsonObj(call?.function);
    if (!fn) {
      continue;
    }
    toolCalls.push({
      id: jsonStr(call?.id) ?? '',
      name: jsonStr(fn.name) ?? '',
      args: parseArgs(jsonStr(fn.arguments)),
    });
  }
  return { text, toolCalls, usage: readOpenAiUsage(data) };
}

function readOpenAiUsage(data: Json): TokenUsage | undefined {
  const usage = jsonObj(jsonObj(data)?.usage);
  if (!usage) {
    return undefined;
  }
  const inputTokens = jsonNum(usage.prompt_tokens);
  const outputTokens = jsonNum(usage.completion_tokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  const cached = jsonNum(jsonObj(usage.prompt_tokens_details)?.cached_tokens);
  return {
    inputTokens,
    outputTokens,
    ...(cached === undefined ? {} : { cachedInputTokens: cached }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Config schema fragment shared by the LLM blocks (provider + base URL). */
export const providerConfig = {
  provider: z
    .enum(['anthropic', 'openai', 'ollama'])
    .default('anthropic')
    .describe(
      'LLM provider. "openai" covers any OpenAI-compatible endpoint; "ollama" runs your installed local models for free.'
    ),
  baseUrl: z
    .string()
    .optional()
    .meta({ showWhen: { field: 'provider', equals: ['openai', 'ollama'] } })
    .describe(
      'Base URL. OpenAI-compatible endpoint, or the Ollama server (defaults to http://localhost:11434).'
    ),
};

export function getProvider(settings: ProviderSettings): LlmProvider {
  if (settings.provider === 'openai') {
    return createOpenAiProvider(settings.baseUrl || DEFAULT_OPENAI_BASE);
  }
  if (settings.provider === 'ollama') {
    return createOllamaProvider(settings.baseUrl || DEFAULT_OLLAMA_BASE);
  }
  return createAnthropicProvider();
}

/** One-shot completion helper for the simple chat block and the LLM-as-a-tool. */
export async function askLlm(
  prompt: string,
  opts: ProviderSettings & {
    model: string;
    systemPrompt?: string;
    effort: 'low' | 'medium' | 'high';
    maxTokens: number;
  }
): Promise<string> {
  const turn = await getProvider(opts).chat({
    system: opts.systemPrompt,
    messages: [{ role: 'user', text: prompt }],
    tools: [],
    model: opts.model,
    maxTokens: opts.maxTokens,
    effort: opts.effort,
  });
  return turn.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Live model listing (powers the model picker)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the models the provider currently serves. The picker is driven by this
 * live list so it never drifts; catalog hints add a price/context badge, and
 * providers that return pricing live (OpenRouter) override the hint.
 */
export async function listModels(settings: ProviderSettings): Promise<ModelOption[]> {
  if (settings.provider === 'openai') {
    return listOpenAiModels(settings.baseUrl || DEFAULT_OPENAI_BASE);
  }
  if (settings.provider === 'ollama') {
    return listOllamaModels(settings.baseUrl || DEFAULT_OLLAMA_BASE);
  }
  return listAnthropicModels();
}

/**
 * List the models installed on the Ollama server via the native /api/tags,
 * which carries the metadata (parameter size, on-disk size) the picker shows.
 */
async function listOllamaModels(baseUrl: string): Promise<ModelOption[]> {
  const data = await localGetJson(`${ollamaRoot(baseUrl)}/api/tags`);
  const options: ModelOption[] = [];
  for (const raw of jsonArr(jsonObj(data)?.models)) {
    const option = ollamaModelOption(jsonObj(raw));
    if (option) {
      options.push(option);
    }
  }
  return options;
}

/** Normalize one /api/tags entry into a picker option with a size summary. */
export function ollamaModelOption(entry: Record<string, Json> | null): ModelOption | null {
  const name = jsonStr(entry?.name) ?? jsonStr(entry?.model);
  if (!entry || !name) {
    return null;
  }
  const parts: string[] = [];
  const paramSize = jsonStr(jsonObj(entry.details)?.parameter_size);
  if (paramSize) {
    parts.push(paramSize);
  }
  const sizeBytes = jsonNum(entry.size);
  if (sizeBytes !== undefined && sizeBytes > 0) {
    parts.push(`${(sizeBytes / 1_000_000_000).toFixed(1)} GB`);
  }
  parts.push('free');
  return { value: name, label: name, description: parts.join(' | ') };
}

async function listAnthropicModels(): Promise<ModelOption[]> {
  const { anthropicApiKey } = getPreferences<AgentPreferences>();
  if (!anthropicApiKey) {
    throw new Error('Set the Anthropic API key in the AI Agent plugin settings');
  }
  const data = await getJson(ANTHROPIC_MODELS_URL, {
    'x-api-key': anthropicApiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  });
  const options: ModelOption[] = [];
  for (const raw of jsonArr(jsonObj(data)?.data)) {
    const entry = jsonObj(raw);
    const id = jsonStr(entry?.id);
    if (!id) {
      continue;
    }
    const hints = hintsForModel(id);
    options.push({
      value: id,
      label: jsonStr(entry?.display_name) ?? hints.displayName ?? id,
      description: describeModel(hints),
    });
  }
  return options;
}

async function listOpenAiModels(baseUrl: string): Promise<ModelOption[]> {
  const { openaiApiKey } = getPreferences<AgentPreferences>();
  if (!openaiApiKey) {
    throw new Error('Set the OpenAI API key in the AI Agent plugin settings');
  }
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models`;
  const data = await getJson(endpoint, { authorization: `Bearer ${openaiApiKey}` });
  const options: ModelOption[] = [];
  for (const raw of jsonArr(jsonObj(data)?.data)) {
    const option = openAiModelOption(jsonObj(raw));
    if (option) {
      options.push(option);
    }
  }
  return options;
}

/** Normalize one OpenAI-compatible model entry, reading rich fields when present. */
export function openAiModelOption(entry: Record<string, Json> | null): ModelOption | null {
  const id = jsonStr(entry?.id);
  if (!entry || !id) {
    return null;
  }
  const hints = hintsForModel(id);
  const contextWindow = jsonNum(entry.context_length) ?? hints.contextWindow;
  const pricing = openRouterPricing(jsonObj(entry.pricing)) ?? hints.pricing;
  const merged: ModelHints = {
    ...hints,
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(pricing === undefined ? {} : { pricing }),
  };
  return {
    value: id,
    label: jsonStr(entry.name) ?? hints.displayName ?? id,
    description: describeModel(merged),
  };
}

/** OpenRouter returns per-token USD prices as strings; convert to per-MTok. */
export function openRouterPricing(pricing: Record<string, Json> | null): ModelPricing | undefined {
  if (!pricing) {
    return undefined;
  }
  const prompt = Number.parseFloat(jsonStr(pricing.prompt) ?? '');
  const completion = Number.parseFloat(jsonStr(pricing.completion) ?? '');
  if (
    !Number.isFinite(prompt) ||
    !Number.isFinite(completion) ||
    (prompt === 0 && completion === 0)
  ) {
    return undefined;
  }
  return { inputPerMTok: prompt * 1_000_000, outputPerMTok: completion * 1_000_000 };
}
