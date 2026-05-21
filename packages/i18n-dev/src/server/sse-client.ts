/**
 * Subscribe to a hub's SSE feed for translation registry changes. When the
 * hub mutates its registry (another dev's IDE save, a plugin hot-install,
 * an HTTP edit through `/api/i18n/sources`), we receive a `data: { "kind": ... }`
 * frame and trigger `onChange()` to re-scan + re-push HMR data.
 *
 * The subscription auto-reconnects on errors with a fixed 3-second backoff.
 * Returns an abort function the caller invokes on server shutdown.
 */
export interface SseClientOptions {
  readonly apiUrl: string;
  readonly onChange: () => void;
  /** Reconnect delay in milliseconds. Default: 3000. */
  readonly reconnectMs?: number;
}

export function startHubSseClient(options: SseClientOptions): () => void {
  const { apiUrl, onChange, reconnectMs = 3000 } = options;
  let abort: AbortController | null = null;
  let stopped = false;

  const startStream = async () => {
    abort = new AbortController();
    try {
      const res = await fetch(`${apiUrl}/events`, {
        signal: abort.signal,
        headers: { accept: 'text/event-stream' },
      });
      const reader = res.body?.getReader();
      if (!reader) {
        return;
      }
      const decoder = new TextDecoder();
      while (!abort.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (decoder.decode(value, { stream: true }).includes('"kind"')) {
          onChange();
        }
      }
    } catch {
      // Network error or hub restart — retry below.
    }
    if (!stopped && !abort?.signal.aborted) {
      setTimeout(() => {
        startStream().catch(() => undefined);
      }, reconnectMs);
    }
  };

  startStream().catch(() => undefined);

  return () => {
    stopped = true;
    abort?.abort();
  };
}
