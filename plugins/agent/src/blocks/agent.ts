import { defineBlock, input, type Json, log, output, z } from '@brika/sdk';
import { addUsage, costForUsage, type TokenUsage } from '../catalog';
import {
  type ChatMessage,
  type ChatTool,
  getProvider,
  providerConfig,
  type ToolCall,
  type ToolResult,
} from '../providers';

/** Provider tool names must match ^[a-zA-Z0-9_-]{1,64}$; qualified ids don't. */
function toToolName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/** Use a wire payload directly only when it is already a string. */
function stringInput(data: unknown): string {
  return typeof data === 'string' ? data : '';
}

type ToolInfo = { id: string; description?: string; inputSchema?: Json };
type CallTool = (
  tool: string,
  args: Record<string, Json>
) => Promise<{ ok: boolean; content?: string; data?: Json }>;

/** Build the provider tool set from the registry, scoped to the allowlist. */
function buildToolSet(
  registered: ToolInfo[],
  allow: Set<string>
): { tools: ChatTool[]; nameToId: Map<string, string> } {
  const nameToId = new Map<string, string>();
  const tools: ChatTool[] = [];
  for (const tool of registered) {
    if (allow.size > 0 && !allow.has(tool.id)) {
      continue;
    }
    const name = toToolName(tool.id);
    nameToId.set(name, tool.id);
    tools.push({
      name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    });
  }
  return { tools, nameToId };
}

/** Log a run's token usage and estimated cost (surfaces in the live debug Logs). */
function logUsage(model: string, usage: TokenUsage): void {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) {
    return;
  }
  const cost = costForUsage(model, usage);
  const costLabel = cost !== undefined ? `~$${cost.toFixed(4)}` : 'cost unavailable';
  log.info(
    `Agent run: ${usage.inputTokens} in / ${usage.outputTokens} out tokens (${model}), ${costLabel}`
  );
}

/** Execute each requested tool call via ctx.callTool, returning normalized results. */
async function runToolCalls(
  calls: ToolCall[],
  nameToId: Map<string, string>,
  callTool: CallTool,
  onToolCall: (tool: string, result: string) => void
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    const qualifiedId = nameToId.get(call.name);
    let content: string;
    if (qualifiedId) {
      const res = await callTool(qualifiedId, call.args);
      content = res.ok
        ? (res.content ?? JSON.stringify(res.data ?? null))
        : (res.content ?? 'Tool call failed');
      onToolCall(qualifiedId, content);
    } else {
      content = `Unknown tool: ${call.name}`;
    }
    results.push({ id: call.id, content });
  }
  return results;
}

/**
 * AI Agent: a long-lived block that, on each prompt, runs a bounded
 * reason -> call-tool -> observe loop to completion (a run-to-completion island
 * in the reactive stream). It enumerates the hub tool registry via ctx.listTools
 * (scoped by the `tools` allowlist), gives them to the configured provider,
 * executes each requested tool call via ctx.callTool, and loops until the model
 * answers or hits `maxIterations`. Provider-agnostic (Anthropic or any
 * OpenAI-compatible endpoint); keys come from the plugin-global preferences.
 */
export const agentBlock = defineBlock({
  id: 'agent',
  meta: {
    name: 'AI Agent',
    description: 'LLM agent that reasons and calls tools to answer each prompt',
    category: 'action',
    icon: 'bot',
    color: '#d97757',
  },
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    reply: output(z.string(), { name: 'Reply' }),
    toolCall: output(z.object({ tool: z.string(), result: z.string() }), { name: 'Tool Call' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    prompt: z
      .string()
      .optional()
      .describe(
        'Goal sent to the agent. Reference incoming data with {{ inputs.in }} or {{ inputs.in.field }}. Leave empty to use a string piped into the Input.'
      ),
    ...providerConfig,
    model: z
      .dynamicDropdown({ label: 'Model' })
      .default('claude-opus-4-8')
      .describe('Pick a model from the chosen provider, or enter a custom id'),
    systemPrompt: z.string().optional().describe('System prompt defining the agent persona/rules'),
    effort: z
      .enum(['low', 'medium', 'high'])
      .default('high')
      .meta({ showWhen: { field: 'provider', equals: 'anthropic' } })
      .describe('Reasoning effort and token spend (Anthropic)'),
    maxTokens: z.number().int().min(1).max(16000).default(4096),
    maxIterations: z.number().int().min(1).max(20).default(8).describe('Tool-loop iteration cap'),
    tools: z
      .array(z.string())
      .default([])
      .meta({ label: 'Tools', format: 'tool-multiselect' })
      .describe('Which tools the agent may call (none selected = all registered tools)'),
  }),
  run: ({ inputs, outputs, config, callTool, listTools }) => {
    inputs.in.on(async (data) => {
      const templated = config.prompt?.trim();
      const prompt = templated && templated.length > 0 ? templated : stringInput(data);
      if (!prompt) {
        outputs.error.emit({
          message: 'Empty prompt. Set the Prompt field or pipe a string into the Input.',
        });
        return;
      }

      try {
        const provider = getProvider({ provider: config.provider, baseUrl: config.baseUrl });
        const { tools, nameToId } = buildToolSet(await listTools(), new Set(config.tools));
        const history: ChatMessage[] = [{ role: 'user', text: prompt }];
        let total: TokenUsage = { inputTokens: 0, outputTokens: 0 };

        for (let i = 0; i < config.maxIterations; i++) {
          const turn = await provider.chat({
            system: config.systemPrompt,
            messages: history,
            tools,
            model: config.model,
            maxTokens: config.maxTokens,
            effort: config.effort,
          });
          if (turn.usage) {
            total = addUsage(total, turn.usage);
          }
          history.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls });

          if (turn.toolCalls.length === 0) {
            outputs.reply.emit(turn.text);
            logUsage(config.model, total);
            return;
          }

          const results = await runToolCalls(turn.toolCalls, nameToId, callTool, (tool, result) =>
            outputs.toolCall.emit({ tool, result })
          );
          history.push({ role: 'tool', results });
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
