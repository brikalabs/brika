import { getPreferences, z } from '@brika/sdk';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Plugin-global config. The API key is a password preference, set once in the
 * AI Agent plugin settings and stored securely (OS keychain), shared by every
 * agent block and tool. */
interface AgentPreferences {
  apiKey?: string;
}

/**
 * Shape of the Anthropic Messages API response we depend on. Validated with zod
 * so a malformed body throws rather than silently producing an empty reply. With
 * adaptive thinking, `content` also carries `thinking` blocks (empty text by
 * default), so we keep only `type: "text"` blocks.
 */
const MessagesResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ output_tokens: z.number() }).optional(),
});

export interface AskOptions {
  model: string;
  systemPrompt?: string;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
}

/**
 * One Anthropic Messages call (Claude Opus 4.8 by default, adaptive thinking).
 * The key comes from the plugin-global `apiKey` preference. Throws on a missing
 * key or a non-2xx response; callers handle the error.
 */
export async function askClaude(prompt: string, opts: AskOptions): Promise<string> {
  const { apiKey } = getPreferences<AgentPreferences>();
  if (!apiKey) {
    throw new Error('Set the Anthropic API key in the AI Agent plugin settings');
  }

  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: opts.effort },
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  };

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

  const parsed = MessagesResponseSchema.parse(await res.json());
  return parsed.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}
