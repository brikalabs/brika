/**
 * `net.local` grant — hub-side handler for consented loopback egress.
 *
 * The strict inverse of `net.fetch`: where that grant allow-lists public hosts
 * and runs the SSRF guard (`assertPublicHost`), this one permits ONLY loopback
 * on operator-consented ports (`assertLoopbackHost`) and rejects every other
 * host. The public guard is left byte-for-byte untouched; this is additive.
 *
 * It reuses the shared `performFetch` pipeline (body cap, timeout, retry,
 * concurrency limit) but forces `maxRedirects: 0`: a local server has no reason
 * to redirect, and following one could escape loopback to a public host. The
 * `scope` handed to `performFetch` is a dummy empty allow-list, never consulted
 * because no redirect is ever followed.
 */

import { defineGrant } from '@brika/grants';
import { type LocalNetScope, netLocal as spec } from '@brika/sdk/grants';
import { assertLoopbackHost, type DnsResolver } from './dns-guard';
import { performFetch } from './perform';
import type { ConcurrencyLimiter } from './semaphore';
import type { NetCallbacks } from './types';
import { assertSafeUrl } from './url-safety';

/**
 * Build the `net.local` grant, sharing the calling plugin's fetch callback,
 * concurrency limiter, and DNS resolver with the `net.fetch` family.
 */
export function buildLocalNetGrant(
  cb: NetCallbacks,
  limiter: ConcurrencyLimiter,
  resolver: DnsResolver
) {
  return defineGrant(spec.spec, async (ctx, args) => {
    const scope: LocalNetScope = ctx.grantedScope;
    const url = assertSafeUrl(args.url);
    assertLoopbackHost(url, scope.allowLoopbackPorts);

    const release = await limiter.acquire(ctx.pluginUid);
    try {
      return await performFetch({
        cb,
        args: { ...args, maxRedirects: 0 },
        scope: { allow: [] },
        parentSignal: ctx.signal,
        resolver,
      });
    } finally {
      release();
    }
  });
}
