/**
 * Manual redirect handling with per-hop allow-list re-check.
 *
 * The default `redirect: 'follow'` is the real SSRF hole: an allow-listed
 * host can return `302 Location: http://169.254.169.254/...` and `fetch`
 * will happily follow into private space, because the host check only
 * fired against the original URL.
 *
 * We switch to `redirect: 'manual'` and run the chain ourselves:
 *   - on 3xx, parse `Location`
 *   - re-run `assertSafeUrl` + `isHostAllowed` + `assertPublicHost`
 *   - if any check fails, throw `NET_REDIRECT_BLOCKED` (or the specific
 *     code from the failing check)
 *   - if hop count exceeds the cap, throw `NET_REDIRECT_LOOP`
 *
 * Body handling on redirect follows RFC 7231 §6.4 and §7:
 *   - 301 / 302 / 303 may strip the body and downgrade to GET (303 must)
 *   - 307 / 308 preserve method and body
 * The schema rejects bodies on GET/HEAD anyway, so the only practical case
 * is "POST → 303 → GET" — handled by clearing the body and rewriting the
 * method.
 */

import { errors } from '@brika/errors';
import type { FetchArgs, NetScope } from '@brika/sdk/grants';
import type { DnsResolver } from './dns-guard';
import { assertPublicHost } from './dns-guard';
import { isHostAllowed } from './host-allow';
import { REDIRECT_STATUS } from './types';
import { assertSafeUrl } from './url-safety';

export interface RedirectContext {
  readonly args: FetchArgs;
  readonly scope: NetScope;
  readonly resolver: DnsResolver;
  readonly maxRedirects: number;
}

export interface RedirectStep {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
}

/**
 * Compute the next step after a 3xx, or null if `response` is not a
 * redirect. Throws if the redirect target is not allowed, or if the hop
 * count has been exceeded.
 *
 * Inputs:
 *   - `response`: the just-received Response
 *   - `currentUrl`: the URL we just fetched (the Location header may be
 *     relative)
 *   - `currentMethod` / `currentBody`: what we sent on the previous hop
 *   - `hop`: 0-indexed hop number (0 = first response, before any follow)
 *   - `context`: scope, resolver, hop cap
 */
export async function resolveRedirect(
  response: Response,
  currentUrl: string,
  currentMethod: string,
  currentBody: string | undefined,
  hop: number,
  context: RedirectContext
): Promise<RedirectStep | null> {
  if (!REDIRECT_STATUS.has(response.status)) {
    return null;
  }
  if (hop + 1 > context.maxRedirects) {
    throw errors.netRedirectLoop({ url: currentUrl, hops: context.maxRedirects });
  }
  const location = response.headers.get('location');
  if (!location) {
    // A 3xx with no Location is malformed; treat it as a non-redirect so
    // the caller returns the response as-is and the plugin sees the raw
    // status. This is safer than throwing — some servers return 304 with
    // no Location intentionally.
    return null;
  }
  // Resolve relative Locations against the current URL.
  const target = new URL(location, currentUrl);
  // Protocol + host re-check. Both are mandatory regardless of allow-list
  // — a redirect to file:// or to a private IP must always be blocked.
  const targetUrl = assertSafeUrl(target);
  if (!isHostAllowed(targetUrl.hostname, context.scope.allow)) {
    throw errors.netRedirectBlocked({
      from: currentUrl,
      to: targetUrl.toString(),
      allow: [...context.scope.allow],
    });
  }
  await assertPublicHost(targetUrl.hostname, context.resolver);

  const [nextMethod, nextBody] = rewriteForRedirect(response.status, currentMethod, currentBody);
  return {
    url: targetUrl.toString(),
    method: nextMethod,
    body: nextBody,
  };
}

/**
 * RFC 7231 method/body rewrite on redirect:
 *   - 303: always rewrite to GET, drop body
 *   - 301/302: most clients downgrade non-GET to GET, drop body (matches
 *     fetch / browsers); we follow suit for compatibility
 *   - 307/308: preserve method and body
 */
function rewriteForRedirect(
  status: number,
  method: string,
  body: string | undefined
): [string, string | undefined] {
  if (status === 307 || status === 308) {
    return [method, body];
  }
  if (method === 'GET' || method === 'HEAD') {
    return [method, undefined];
  }
  return ['GET', undefined];
}
