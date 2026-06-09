import { defineBlock, getPreferences, input, type Json, log, output, z } from '@brika/sdk';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ── Json navigation (curated z lacks z.json; JSON.parse widens any -> Json) ──
function parseJson(text: string): Json {
  return JSON.parse(text);
}
function jsonObj(value: Json | undefined): Record<string, Json> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function jsonArr(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}
function jsonStr(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Anthropic tool names must match ^[a-zA-Z0-9_-]{1,64}$; qualified ids don't. */
function toToolName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

type ToolInfo = { id: string; description?: string; inputSchema?: Json };
type ToolResult = { ok: boolean; content?: string; data?: Json };
type CallTool = (tool: string, args: Record<string, Json>) => Promise<ToolResult>;

/** Build the Anthropic `tools[]` from the registry, scoped to the allowlist. */
function buildToolSet(
  registered: ToolInfo[],
  allow: Set<string>
): { tools: Json[]; nameToId: Map<string, string> } {
  const nameToId = new Map<string, string>();
  const tools: Json[] = [];
  for (const tool of registered) {
    if (allow.size > 0 && !allow.has(tool.id)) {
      continue;
    }
    const name = toToolName(tool.id);
    nameToId.set(name, tool.id);
    tools.push({
      name,
      description: tool.description ?? '',
      input_schema: tool.inputSchema ?? { type: 'object', properties: {} },
    });
  }
  return { tools, nameToId };
}

/** Concatenate the text of every `text` content block. */
function textOf(content: Json[]): string {
  return content
    .map((block) => {
      const b = jsonObj(block);
      return b && jsonStr(b.type) === 'text' ? (jsonStr(b.text) ?? '') : '';
    })
    .join('');
}

/** Execute each `tool_use` block via ctx.callTool, returning the `tool_result` turns. */
async function executeToolUses(
  content: Json[],
  nameToId: Map<string, string>,
  callTool: CallTool,
  onToolCall: (tool: string, result: string) => void
): Promise<Json[]> {
  const results: Json[] = [];
  for (const block of content) {
    const b = jsonObj(block);
    if (!b || jsonStr(b.type) !== 'tool_use') {
      continue;
    }
    const qualifiedId = nameToId.get(jsonStr(b.name) ?? '');
    let resultText: string;
    if (!qualifiedId) {
      resultText = `Unknown tool: ${jsonStr(b.name) ?? ''}`;
    } else {
      const res = await callTool(qualifiedId, jsonObj(b.input) ?? {});
      resultText = res.ok
        ? (res.content ?? JSON.stringify(res.data ?? null))
        : (res.content ?? 'Tool call failed');
      onToolCall(qualifiedId, resultText);
    }
    results.push({ type: 'tool_result', tool_use_id: jsonStr(b.id) ?? '', content: resultText });
  }
  return results;
}

async function callClaude(apiKey: string, body: Record<string, Json | undefined>): Promise<Json> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Claude request failed (${res.status}): ${await res.text()}`);
  }
  return parseJson(await res.text());
}

/**
 * AI Agent: a long-lived block that, on each prompt, runs a bounded
 * reason -> call-tool -> observe loop to completion (a run-to-completion island
 * in the reactive stream). It enumerates the hub tool registry via ctx.listTools
 * (scoped by the `tools` allowlist), gives them to Claude, executes each
 * `tool_use` via ctx.callTool, and loops until Claude answers or hits
 * `maxIterations`. The API key is the plugin-global `apiKey` preference.
 */
export const agentBlock = defineBlock({
  id: 'agent',
  meta: {
    name: 'AI Agent',
    description: 'Claude agent that reasons and calls tools to answer each prompt',
    category: 'action',
    icon: 'bot',
    color: '#d97757',
  },
  inputs: {
    prompt: input(z.string(), { name: 'Prompt' }),
  },
  outputs: {
    reply: output(z.string(), { name: 'Reply' }),
    toolCall: output(z.object({ tool: z.string(), result: z.string() }), { name: 'Tool Call' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    model: z.enum(['claude-opus-4-8', 'claude-sonnet-4-6']).default('claude-opus-4-8'),
    systemPrompt: z.string().optional().describe('System prompt defining the agent persona/rules'),
    effort: z.enum(['low', 'medium', 'high']).default('high'),
    maxTokens: z.number().int().min(1).max(16000).default(4096),
    maxIterations: z.number().int().min(1).max(20).default(8).describe('Tool-loop iteration cap'),
    tools: z
      .array(z.string())
      .default([])
      .describe('Qualified tool ids the agent may call (empty = all registered tools)'),
  }),
  run: ({ inputs, outputs, config, callTool, listTools }) => {
    inputs.prompt.on(async (prompt) => {
      const { apiKey } = getPreferences<{ apiKey?: string }>();
      if (!apiKey) {
        outputs.error.emit({
          message: 'Set the Anthropic API key in the AI Agent plugin settings',
        });
        return;
      }

      try {
        const { tools, nameToId } = buildToolSet(await listTools(), new Set(config.tools));
        const messages: Json[] = [{ role: 'user', content: prompt }];

        for (let i = 0; i < config.maxIterations; i++) {
          const data = await callClaude(apiKey, {
            model: config.model,
            max_tokens: config.maxTokens,
            thinking: { type: 'adaptive' },
            output_config: { effort: config.effort },
            system: config.systemPrompt,
            messages,
            tools: tools.length > 0 ? tools : undefined,
          });

          const content = jsonArr(jsonObj(data)?.content);
          // Echo the assistant turn verbatim so tool_use blocks round-trip.
          messages.push({ role: 'assistant', content });

          if (jsonStr(jsonObj(data)?.stop_reason) !== 'tool_use') {
            outputs.reply.emit(textOf(content));
            return;
          }

          const results = await executeToolUses(content, nameToId, callTool, (tool, result) =>
            outputs.toolCall.emit({ tool, result })
          );
          messages.push({ role: 'user', content: results });
        }

        outputs.error.emit({
          message: `Agent did not finish within ${config.maxIterations} steps`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Agent failed: ${message}`);
        outputs.error.emit({ message });
      }
    });
  },
});
