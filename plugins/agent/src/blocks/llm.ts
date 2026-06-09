import { defineBlock, input, log, output, z } from '@brika/sdk';
import { askLlm, providerConfig } from '../providers';

/**
 * Ask AI: a trigger fires, a prompt goes out, the completion text comes back.
 *
 * The prompt lives on the node as a config field with `{{ }}` template support,
 * so a bare trigger (a Button, a clock tick) is enough to run it. Reference the
 * incoming payload with `{{ inputs.in }}` or `{{ inputs.in.field }}`; leave the
 * field empty to use a string piped straight into the trigger.
 *
 * Provider-agnostic: Anthropic (Claude) or any OpenAI-compatible endpoint via
 * the `provider` config. Keys come from the plugin-global preferences; egress is
 * the operator-consented `dev.brika.net.fetch` grant.
 */
export const llmBlock = defineBlock({
  id: 'llm',
  meta: {
    name: 'Ask AI',
    description: 'Send a prompt to an LLM and emit the completion',
    category: 'transform',
    icon: 'sparkles',
    color: '#d97757',
  },
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    text: output(z.string(), { name: 'Text' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    prompt: z
      .string()
      .optional()
      .describe(
        'Prompt sent to the model. Reference incoming data with {{ inputs.in }} or {{ inputs.in.field }}. Leave empty to use a string piped into the Input.'
      ),
    ...providerConfig,
    model: z
      .dynamicDropdown({ label: 'Model' })
      .default('claude-opus-4-8')
      .describe('Pick a model from the chosen provider, or enter a custom id'),
    systemPrompt: z
      .string()
      .optional()
      .describe('Optional system prompt that sets the assistant persona'),
    effort: z
      .enum(['low', 'medium', 'high'])
      .default('high')
      .meta({ showWhen: { field: 'provider', equals: 'anthropic' } })
      .describe('Reasoning effort and token spend (Anthropic)'),
    maxTokens: z
      .number()
      .int()
      .min(1)
      .max(16000)
      .default(4096)
      .describe('Maximum tokens in the reply'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.in.on(async (data) => {
      const templated = config.prompt?.trim();
      const prompt = templated && templated.length > 0 ? templated : stringInput(data);
      if (!prompt) {
        log.warn('Ask AI: empty prompt. Set the Prompt field or pipe a string into the Input.');
        return;
      }
      try {
        const text = await askLlm(prompt, {
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          systemPrompt: config.systemPrompt,
          effort: config.effort,
          maxTokens: config.maxTokens,
        });
        log.info('LLM replied');
        outputs.text.emit(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Ask AI failed: ${message}`);
        outputs.error.emit({ message });
      }
    });
  },
});

/** Use a wire payload directly only when it is already a string. */
function stringInput(data: unknown): string {
  return typeof data === 'string' ? data : '';
}
