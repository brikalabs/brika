/**
 * Healthcheck primitives used by the supervisor to gate dependent
 * services. Both functions honor an `AbortSignal` so the supervisor
 * can cancel a running probe when its child crashes early.
 *
 * Polling lives in {@link pollUntil} (see `./time`) so one tested
 * implementation backs every "wait until X" call.
 */

import { Socket } from 'node:net';
import { HEALTH_POLL_INTERVAL_MS } from '../constants';
import { HealthCheckTimeoutError } from '../errors';
import { pollUntil } from '../time';

const TCP_CONNECT_TIMEOUT_MS = 1_000;

/**
 * Resolve once GET `url` returns a 2xx, or throw
 * {@link HealthCheckTimeoutError} on deadline. The AbortSignal cancels
 * the in-flight `fetch` and the next sleep, so cancellation is prompt.
 */
export async function waitForHttp(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  await pollUntil(
    async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      // Drain to free the connection; ignore body decode errors.
      await res.arrayBuffer().catch(() => undefined);
    },
    {
      timeoutMs,
      intervalMs: HEALTH_POLL_INTERVAL_MS,
      signal,
      errorMessage: (cause) => new HealthCheckTimeoutError('http', url, timeoutMs, cause).message,
    }
  );
}

/**
 * Resolve once `port` accepts a TCP connection on the loopback. Tries
 * IPv4 (`127.0.0.1`) and IPv6 (`::1`) in parallel and succeeds on the
 * first connection — dev tools bind unpredictably (Vite's Cloudflare
 * plugin binds v6 only on macOS; bare bun.serve binds v4 by default).
 */
export async function waitForTcp(
  port: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  await pollUntil(() => tryConnectAny(port), {
    timeoutMs,
    intervalMs: HEALTH_POLL_INTERVAL_MS,
    signal,
    errorMessage: (cause) =>
      new HealthCheckTimeoutError('tcp', `localhost:${port}`, timeoutMs, cause).message,
  });
}

/** First successful connect (v4 OR v6) wins. */
function tryConnectAny(port: number): Promise<void> {
  return Promise.any([tryConnect(port, '127.0.0.1'), tryConnect(port, '::1')]).then(
    () => undefined,
    (err: AggregateError) => {
      // Promise.any rejects with AggregateError when ALL hosts fail —
      // surface the first underlying error for clearer diagnostics.
      const first = err.errors[0];
      throw first instanceof Error ? first : new Error(String(first));
    }
  );
}

function tryConnect(port: number, host: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const sock = new Socket();
    const settle = (fn: () => void): void => {
      sock.removeAllListeners();
      sock.destroy();
      fn();
    };
    sock.setTimeout(TCP_CONNECT_TIMEOUT_MS);
    sock.once('connect', () => settle(resolve));
    sock.once('timeout', () => settle(() => reject(new Error('connect timeout'))));
    sock.once('error', (err) => settle(() => reject(err)));
    sock.connect(port, host);
  });
}
