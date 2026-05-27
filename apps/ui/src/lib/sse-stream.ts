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
  if (!line.startsWith('data: ')) {
    return null;
  }
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
export function createProgressStream<
  T extends {
    phase?: string;
  },
>(response: Response): ProgressStream<T> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let progressCallback: ((data: T) => void) | null = null;
  /**
   * Track completion state so `.onComplete()` can resolve
   * immediately when registered after the stream has already
   * finished. Previously `completeResolve` was set only by the
   * `.onComplete()` call, and a short SSE response (or a non-2xx
   * error response, which still carries a body that gets read to
   * `done` before the caller awaits) would lose the resolve signal
   * and hang forever.
   */
  let done = false;
  let completeResolve: (() => void) | null = null;
  let closed = false;
  let lineBuffer = '';

  const resolveComplete = () => {
    done = true;
    completeResolve?.();
  };

  const handleData = (data: T) => {
    progressCallback?.(data);
    if (data.phase === 'complete' || data.phase === 'error' || data.phase === 'restarting') {
      resolveComplete();
    }
  };

  const processText = (text: string) => {
    const combined = lineBuffer + text;
    const lines = combined.split('\n');
    lineBuffer = lines.pop() ?? ''; // Last element may be an incomplete line
    for (const line of lines) {
      const data = parseSseLine<T>(line);
      if (data) {
        handleData(data);
      }
    }
  };

  const flushBuffer = () => {
    if (lineBuffer) {
      const data = parseSseLine<T>(lineBuffer);
      if (data) {
        handleData(data);
      }
      lineBuffer = '';
    }
  };

  const read = async () => {
    if (!reader || closed) {
      resolveComplete();
      return;
    }

    try {
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone || closed) {
          flushBuffer();
          resolveComplete();
          break;
        }
        processText(
          decoder.decode(value, {
            stream: true,
          })
        );
      }
    } catch {
      resolveComplete();
    }
  };

  read();

  return {
    onProgress: (callback) => {
      progressCallback = callback;
    },
    onComplete: () =>
      new Promise<void>((resolve) => {
        if (done) {
          resolve();
        } else {
          completeResolve = resolve;
        }
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
 * Structured error raised when `fetchProgressStream` gets a non-2xx
 * response. Carries the status code + parsed JSON body so the caller
 * can render channel-specific messages (e.g. the 409 from the update
 * refusal path includes `{code, guidance}`).
 */
export class ProgressStreamHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ProgressStreamHttpError';
    this.status = status;
    this.body = body;
  }
}

function describeError(status: number, body: unknown): string {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const errField = body.error;
    if (typeof errField === 'string' && errField.length > 0) {
      return errField;
    }
  }
  if (typeof body === 'string' && body.length > 0) {
    return body;
  }
  return `HTTP ${status}`;
}

/** Read a non-2xx response body as JSON, falling back to text, then null. */
async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // ignore — try text
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function buildQueryUrl(
  url: string,
  query: Record<string, string | boolean | number | undefined> | undefined
): string {
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  if (!qs) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

/**
 * Fetch an endpoint and return a typed progress stream.
 * Defaults to POST with JSON body, but accepts any RequestInit.
 *
 * Non-2xx responses throw {@link ProgressStreamHttpError} *before*
 * any SSE parsing — without this, a 4xx JSON body (e.g. our
 * 409 Conflict refusal path on `/api/system/update/apply`) flows
 * through the SSE reader, produces zero `data:` lines, and the
 * caller's UI gets stuck waiting for progress events that never
 * arrive.
 */
export async function fetchProgressStream<
  T extends {
    phase?: string;
  },
>(url: string, options?: FetchProgressStreamOptions): Promise<ProgressStream<T>> {
  const { query, ...init } = options ?? {};
  const response = await fetch(buildQueryUrl(url, query), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ProgressStreamHttpError(response.status, body, describeError(response.status, body));
  }

  return createProgressStream<T>(response);
}
