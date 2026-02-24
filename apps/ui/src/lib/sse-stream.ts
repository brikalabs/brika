/**
 * Shared SSE Progress Stream Utility
 *
 * Generic helper for consuming Server-Sent Events from POST endpoints
 * that stream progress updates. Used by plugin registry and hub updates.
 */

export interface ProgressStream<T = unknown> {
  onProgress: (callback: (data: T) => void) => void;
  onComplete: () => Promise<void>;
  close: () => void;
}

function parseSseLine<T>(line: string): T | null {
  if (!line.startsWith('data: ')) return null;
  try {
    return JSON.parse(line.slice(6)) as T;
  } catch {
    return null;
  }
}

/**
 * Create a typed progress stream from a fetch Response.
 * Reads the SSE body stream and dispatches parsed events.
 *
 * Buffers incomplete lines across chunk boundaries so no events are lost,
 * and resolves onComplete() if the stream closes unexpectedly.
 */
export function createProgressStream<T extends { phase?: string }>(
  response: Response
): ProgressStream<T> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let progressCallback: ((data: T) => void) | null = null;
  let completeResolve: (() => void) | null = null;
  let closed = false;
  let lineBuffer = '';

  const handleData = (data: T) => {
    progressCallback?.(data);
    if (data.phase === 'complete' || data.phase === 'error' || data.phase === 'restarting') {
      completeResolve?.();
    }
  };

  const processText = (text: string) => {
    const combined = lineBuffer + text;
    const lines = combined.split('\n');
    lineBuffer = lines.pop() ?? ''; // Last element may be an incomplete line
    for (const line of lines) {
      const data = parseSseLine<T>(line);
      if (data) handleData(data);
    }
  };

  const read = async () => {
    if (!reader || closed) return;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done || closed) {
          // Flush any remaining buffered data before resolving
          if (lineBuffer) {
            const data = parseSseLine<T>(lineBuffer);
            if (data) handleData(data);
            lineBuffer = '';
          }
          completeResolve?.();
          break;
        }
        processText(decoder.decode(value, { stream: true }));
      }
    } catch {
      completeResolve?.();
    }
  };

  read();

  return {
    onProgress: (callback) => {
      progressCallback = callback;
    },
    onComplete: () =>
      new Promise<void>((resolve) => {
        completeResolve = resolve;
      }),
    close: () => {
      closed = true;
      reader?.cancel();
    },
  };
}

export interface FetchProgressStreamOptions extends RequestInit {
  /** Query parameters appended to the URL */
  query?: Record<string, string | boolean | number | undefined>;
}

/**
 * Fetch an endpoint and return a typed progress stream.
 * Defaults to POST with JSON body, but accepts any RequestInit.
 */
export async function fetchProgressStream<T extends { phase?: string }>(
  url: string,
  options?: FetchProgressStreamOptions
): Promise<ProgressStream<T>> {
  const { query, ...init } = options ?? {};

  let finalUrl = url;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) finalUrl += `${url.includes('?') ? '&' : '?'}${qs}`;
  }

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  return createProgressStream<T>(response);
}
