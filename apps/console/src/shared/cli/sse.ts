/**
 * Minimal SSE parser. Yields each `data:` payload from a fetch Response
 * as the value of type `T`. Malformed frames are silently dropped.
 */

import pc from 'picocolors';
import { CliError } from './errors';

export async function* streamSseEvents<T = unknown>(res: Response): AsyncGenerator<T> {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new CliError(`${pc.red('Error')} — no response stream`);
  }

  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }
        try {
          yield JSON.parse(line.slice(6)) as T;
        } catch {
          // ignore malformed SSE frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
