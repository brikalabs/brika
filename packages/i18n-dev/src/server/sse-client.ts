/**
 * Subscribe to a hub's SSE feed for translation registry changes. When the
 * hub mutates its registry (another dev's IDE save, a plugin hot-install,
 * an HTTP edit through `/api/i18n/sources`), we receive a `data: { "kind": ... }`
 * frame and trigger `onChange()` to re-scan + re-push HMR data.
 *
 * `onChange()` is also fired exactly once each time the stream successfully
 * (re)connects — so if the hub came up after the initial scan, the validator
 * picks up its bundle as soon as the subscription lands instead of waiting
 * for an unrelated file event to trigger a rescan.
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
      // Force a rescan whenever the stream (re)connects — covers the boot-race
      // case where the hub came up *after* the initial scan, leaving the
      // overlay stuck on a `plugin-error` until something touched a file.
      onChange();
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
