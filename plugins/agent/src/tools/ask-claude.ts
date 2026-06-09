import { defineTool } from '@brika/sdk';
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
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The question or instruction for Claude' },
      },
      required: ['prompt'],
    },
  },
  async (args) => {
    const prompt = typeof args.prompt === 'string' ? args.prompt : '';
    return askLlm(prompt, {
      model: 'anthropic:claude-opus-4-8',
      effort: 'high',
      maxTokens: 4096,
    });
  }
);
