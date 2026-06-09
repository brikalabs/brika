import { defineBlock, input, log, output, z } from '@brika/sdk';
import { askClaude } from '../anthropic';

/**
 * Ask Claude: a trigger fires, a prompt goes out, the completion text comes back.
 *
 * The prompt lives on the node as a config field with `{{ }}` template support,
 * so a bare trigger (a Button, a clock tick) is enough to run it. Reference the
 * incoming payload with `{{ inputs.in }}` or `{{ inputs.in.field }}`; leave the
 * field empty to use a string piped straight into the trigger. The input is a
 * generic trigger, so any upstream value drives it (it is never type-dropped).
 *
 * Defaults to Claude Opus 4.8 with adaptive thinking. The API key comes from the
 * plugin-global `apiKey` preference; egress is the operator-consented
 * `dev.brika.net.fetch` grant scoped to api.anthropic.com.
 */
export const llmBlock = defineBlock({
  id: 'llm',
  meta: {
    name: 'Ask Claude',
    description: 'Send a prompt to Claude and emit the completion',
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
        'Prompt sent to Claude. Reference incoming data with {{ inputs.in }} or {{ inputs.in.field }}. Leave empty to use a string piped into the Input.'
      ),
    model: z
      .enum(['claude-opus-4-8', 'claude-sonnet-4-6'])
      .default('claude-opus-4-8')
      .describe('Claude model'),
    systemPrompt: z
      .string()
      .optional()
      .describe('Optional system prompt that sets the assistant persona'),
    effort: z
      .enum(['low', 'medium', 'high'])
      .default('high')
      .describe('Reasoning effort and token spend'),
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
      // `config.prompt` is resolved against the live input scope when templated.
      // Empty field falls back to a string sent on the wire (pipe-a-prompt).
      const templated = config.prompt?.trim();
      const prompt = templated && templated.length > 0 ? templated : stringInput(data);
      if (!prompt) {
        log.warn('Ask Claude: empty prompt. Set the Prompt field or pipe a string into the Input.');
        return;
      }
      try {
        const text = await askClaude(prompt, {
          model: config.model,
          systemPrompt: config.systemPrompt,
          effort: config.effort,
          maxTokens: config.maxTokens,
        });
        log.info('Claude replied');
        outputs.text.emit(text);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Ask Claude failed: ${message}`);
        outputs.error.emit({ message });
      }
    });
  },
});

/** Use a wire payload directly only when it is already a string. */
function stringInput(data: unknown): string {
  return typeof data === 'string' ? data : '';
}
