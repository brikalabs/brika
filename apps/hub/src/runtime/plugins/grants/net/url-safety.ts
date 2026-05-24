/**
 * URL pre-flight validation.
 *
 * Runs before the host allow-list check: catches protocols that have no
 * business reaching `fetch` (file://, data://, javascript:, …) and surfaces
 * a clean error code instead of relying on the hostname check accidentally
 * rejecting them.
 *
 * Pure utility — no I/O, no async. The actual DNS work is in `dns-guard.ts`.
 */

import { errors } from '@brika/errors';
import { ALLOWED_PROTOCOLS } from './types';

/**
 * Validate that `url`'s protocol is in the allow-list. Throws
 * `NET_PROTOCOL_BLOCKED` otherwise. Returns the parsed `URL` so callers can
 * reuse it without re-parsing.
 *
 * We re-parse rather than trust an incoming `URL` instance — IPC may have
 * stringified it anyway, and the SDK schema accepts strings. Parsing here
 * also normalizes (lowercases the protocol, etc.).
 */
export function assertSafeUrl(input: string | URL): URL {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.toString());
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw errors.netProtocolBlocked({ protocol: url.protocol });
  }
  return url;
}
