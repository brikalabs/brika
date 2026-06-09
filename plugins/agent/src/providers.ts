import { getPreferences, type Json, z } from '@brika/sdk';

/**
 * LLM provider abstraction.
 *
 * The agent loop and the simple chat block talk to this normalized interface,
 * never to a vendor API directly. Each provider translates the normalized
 * conversation (`ChatMessage[]` + `ChatTool[]`) into its own wire format, makes
 * one round-trip, and translates the reply back into a `ChatTurn`.
 *
 * Two providers ship today: Anthropic (Messages API) and any OpenAI-compatible
 * chat-completions endpoint (OpenAI, OpenRouter, Groq, Together, Mistral, Azure
 * OpenAI). A local provider (Ollama) is intentionally absent: the net.fetch
 * grant's SSRF guard blocks loopback, so local models need a separate
 * egress path (a future follow-up).
 *
 * Keys come from plugin-global password preferences (`anthropicApiKey`,
 * `openaiApiKey`); egress is the operator-consented `dev.brika.net.fetch` grant.
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
}

export interface LlmProvider {
  readonly label: string;
  chat(req: ChatRequest): Promise<ChatTurn>;
}

export type ProviderId = 'anthropic' | 'openai';

export interface ProviderSettings {
  provider: ProviderId;
  /** OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1 (openai only). */
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

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic provider (Messages API)
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
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
      const data = await postJson(
        ANTHROPIC_URL,
        { 'x-api-key': anthropicApiKey, 'anthropic-version': ANTHROPIC_VERSION },
        {
          model: req.model,
          max_tokens: req.maxTokens,
          thinking: { type: 'adaptive' },
          output_config: { effort: req.effort },
          system: req.system,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        }
      );
      return readAnthropicTurn(data);
    },
  };
}

function readAnthropicTurn(data: Json): ChatTurn {
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
  return { text, toolCalls };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible provider (chat/completions)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';

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

function readOpenAiTurn(data: Json): ChatTurn {
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
  return { text, toolCalls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Config schema fragment shared by the LLM blocks (provider + base URL). */
export const providerConfig = {
  provider: z
    .enum(['anthropic', 'openai'])
    .default('anthropic')
    .describe('LLM provider. "openai" covers any OpenAI-compatible endpoint.'),
  baseUrl: z
    .string()
    .optional()
    .describe('OpenAI-compatible base URL (openai only). Defaults to api.openai.com.'),
};

export function getProvider(settings: ProviderSettings): LlmProvider {
  if (settings.provider === 'openai') {
    return createOpenAiProvider(settings.baseUrl || DEFAULT_OPENAI_BASE);
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
