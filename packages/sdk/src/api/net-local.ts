/**
 * `localFetch` — plugin-facing helper for the `dev.brika.net.local.fetch` grant.
 *
 * HTTP to loopback services (Ollama, LM Studio, llama.cpp) on operator-consented
 * ports. Unlike the global `fetch` shim (which routes to `net.fetch` and is
 * blocked from loopback by the SSRF guard), this reaches localhost directly via
 * the strict loopback-only grant. Same request/response shape as the wire grant.
 *
 * Requires `dev.brika.net.local.fetch` in the manifest with an `allowLoopbackPorts`
 * scope the operator has permitted; otherwise the call rejects with
 * `PERMISSION_DENIED`.
 */

import { ctx } from '../ctx';
import type { FetchArgs, FetchResult } from '../grants/net';

export function localFetch(args: FetchArgs): Promise<FetchResult> {
  return ctx.net.local.fetch(args);
}
