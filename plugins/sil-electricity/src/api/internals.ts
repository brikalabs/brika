/**
 * Shared constants and logger used across the api/ modules.
 */

export const BASE = 'https://www.lausanne.ch';
export const IAM = `${BASE}/iam-ui-fusion`;
export const DIAMOND = `${BASE}/eb2sil-ui/diamond-smart-data/load`;
export const GOTO =
  '/vie-pratique/energies-et-eau/services-industriels/particuliers/mon-compte/Ma-consommation/-my-ma-consommation.html?iam=true';

/**
 * Per-request hard timeout. The SIL portal occasionally hangs mid-handshake;
 * without a cap, a stuck connection holds the polling promise open and the
 * brick shows the loader forever. 30 s is well above the normal latency
 * (~5 s for the full login chain) so a real-but-slow network still works.
 */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * `fetch` with a per-request timeout. Aborts via `AbortSignal.timeout` so a
 * hung connection surfaces as a thrown error (caught upstream and reported
 * as a `network` error on the brick). Forwards any caller-supplied signal
 * via `AbortSignal.any`.
 */
export function timedFetch(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export const log = {
  info: (msg: string) => console.log(`[sil] ${msg}`),
  error: (msg: string) => console.error(`[sil] ${msg}`),
};
