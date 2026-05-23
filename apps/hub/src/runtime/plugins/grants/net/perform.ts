/**
 * Orchestrates a single `ctx.net.fetch` call.
 *
 * Combines: redirect chain, retry policy, body cap, abort signal, header
 * sanitation. Returns the wire-shaped `FetchResult` to the grant handler;
 * nothing here knows about IPC, the registry, or per-plugin scope (callers
 * pre-check scope and arrange the resolver).
 */

import type { FetchArgs, NetScope } from '@brika/sdk/grants';
import { readBoundedText } from './body-reader';
import type { DnsResolver } from './dns-guard';
import { resolveRedirect } from './redirect';
import { abortableSleep, shouldRetry } from './retry';
import {
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_TIMEOUT_MS,
  type FetchResult,
  type NetCallbacks,
} from './types';

export interface PerformContext {
  readonly cb: NetCallbacks;
  readonly args: FetchArgs;
  readonly scope: NetScope;
  readonly parentSignal: AbortSignal;
  readonly resolver: DnsResolver;
}

/**
 * Execute the fetch with retry + redirect chain. Single source of truth
 * for "what does one ctx.net.fetch call do to the network."
 */
export async function performFetch(ctx: PerformContext): Promise<FetchResult> {
  const { args } = ctx;
  const maxAttempts = args.retry?.maxAttempts ?? 1;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = args.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRedirects = args.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const baseHeaders: Record<string, string> = { ...args.headers };
  if (args.idempotencyKey) {
    baseHeaders['Idempotency-Key'] = args.idempotencyKey;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await dispatchWithRedirects(
        {
          ...ctx,
          headers: baseHeaders,
          timeoutMs,
          maxRedirects,
        },
        args.url,
        args.method,
        args.body
      );
      const delay = shouldRetry(response, undefined, attempt, args);
      if (delay === null) {
        return await materialize(response, attempt + 1, maxResponseBytes);
      }
      // Drain so the connection can be reused while we wait.
      await response.body?.cancel().catch(() => undefined);
      await abortableSleep(delay, ctx.parentSignal);
    } catch (e) {
      lastError = e;
      const delay = shouldRetry(null, e, attempt, args);
      if (delay === null) {
        throw e;
      }
      await abortableSleep(delay, ctx.parentSignal);
    }
  }
  throw lastError ?? new Error('net.fetch: retry attempts exhausted');
}

interface DispatchContext extends PerformContext {
  readonly headers: Record<string, string>;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
}

/**
 * Single fetch attempt including redirect chain. Returns the FINAL
 * non-redirect response. The chain re-checks each hop against the scope,
 * DNS, and protocol filters.
 */
async function dispatchWithRedirects(
  ctx: DispatchContext,
  initialUrl: string,
  initialMethod: string,
  initialBody: string | undefined
): Promise<Response> {
  let currentUrl = initialUrl;
  let currentMethod = initialMethod;
  let currentBody = initialBody;

  for (let hop = 0; ; hop++) {
    const signal = AbortSignal.any([ctx.parentSignal, AbortSignal.timeout(ctx.timeoutMs)]);
    const response = await ctx.cb.fetch(currentUrl, {
      method: currentMethod,
      headers: ctx.headers,
      body: currentBody,
      signal,
      // Manual redirect: we follow ourselves with per-hop allow-list checks.
      // The default `follow` is the SSRF vector this whole file exists for.
      redirect: 'manual',
    });
    const next = await resolveRedirect(response, currentUrl, currentMethod, currentBody, hop, {
      args: ctx.args,
      scope: ctx.scope,
      resolver: ctx.resolver,
      maxRedirects: ctx.maxRedirects,
    });
    if (next === null) {
      return response;
    }
    // Drain the redirect response body — small, but holding it would pin
    // the connection while we open the next hop.
    await response.body?.cancel().catch(() => undefined);
    currentUrl = next.url;
    currentMethod = next.method;
    currentBody = next.body;
  }
}

async function materialize(
  response: Response,
  attempts: number,
  bodyLimit: number
): Promise<FetchResult> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = await readBoundedText(response, { limit: bodyLimit });
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
    attempts,
  };
}
