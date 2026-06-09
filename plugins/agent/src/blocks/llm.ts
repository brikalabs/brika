import { defineBlock, input, log, output, z } from '@brika/sdk';
import { askClaude } from '../anthropic';

/**
 * Ask Claude: prompt in, completion text out.
 *
 * The smallest useful AI block: one Anthropic Messages call per input event, no
 * tools or memory. Defaults to Claude Opus 4.8 with adaptive thinking. The API
 * key comes from the plugin-global `apiKey` preference; egress is the
 * operator-consented `dev.brika.net.fetch` grant scoped to api.anthropic.com.
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
    prompt: input(z.string(), { name: 'Prompt' }),
  },
  outputs: {
    text: output(z.string(), { name: 'Text' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
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
    inputs.prompt.on(async (prompt) => {
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
