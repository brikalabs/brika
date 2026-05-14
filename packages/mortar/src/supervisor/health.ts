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
 * Resolve once `127.0.0.1:port` accepts a TCP connection. Faster than
 * `http` for dev servers that bind well before they're ready to serve
 * traffic (vite, fastify, …).
 */
export async function waitForTcp(
  port: number,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  await pollUntil(() => tryConnect(port), {
    timeoutMs,
    intervalMs: HEALTH_POLL_INTERVAL_MS,
    signal,
    errorMessage: (cause) =>
      new HealthCheckTimeoutError('tcp', `127.0.0.1:${port}`, timeoutMs, cause).message,
  });
}

function tryConnect(port: number): Promise<void> {
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
    sock.connect(port, '127.0.0.1');
  });
}
