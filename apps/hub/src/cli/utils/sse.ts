import pc from 'picocolors';
import { CliError } from '../errors';

/** Async generator that yields parsed SSE `data:` payloads from a fetch Response. */
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

      buf += decoder.decode(value, {
        stream: true,
      });
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
