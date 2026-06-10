import { defineTool, z } from '@brika/sdk';
import { askLlm } from '../providers';

/**
 * Expose Claude as a hub tool: any agent, voice assistant, rule, or the API can
 * call `ask-claude` by id without going through the workflow editor. This is the
 * agent plugin's first registered tool and exercises the cross-plugin tool layer.
 */
defineTool(
  {
    id: 'ask-claude',
    description:
      'Ask Claude a question and get a text answer. Call for open-ended reasoning, summarization, drafting, or classification.',
    icon: 'sparkles',
    color: '#d97757',
    input: z.object({
      prompt: z.string().min(1).describe('The question or instruction for Claude'),
    }),
  },
  async ({ prompt }) => {
    return askLlm(prompt, {
      model: 'anthropic:claude-opus-4-8',
      effort: 'high',
      maxTokens: 4096,
    });
  }
);
