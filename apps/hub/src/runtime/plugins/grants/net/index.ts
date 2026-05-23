/**
 * `net.fetch` grant — hub-side composition.
 *
 * Glues together host allow-list, DNS rebinding defence, redirect chain,
 * body cap, retry, single-flight coalescing, and per-plugin concurrency
 * limit. The individual concerns live in sibling modules; this file is
 * deliberately thin so the boundary between policy and orchestration is
 * easy to audit at a glance.
 *
 * Public surface (`buildNetGrants`, `NetCallbacks`) matches what
 * `registry-factory.ts` consumed before the split — the refactor is
 * transparent to callers.
 */

import { errors } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import { type FetchArgs, type NetScope, netFetch as spec } from '@brika/sdk/grants';
import { assertPublicHost, type DnsResolver, defaultDnsResolver } from './dns-guard';
import { isHostAllowed } from './host-allow';
import { performFetch } from './perform';
import { ConcurrencyLimiter } from './semaphore';
import { SingleFlightCache, singleFlightKey } from './single-flight';
import type { FetchResult, NetCallbacks } from './types';
import { assertSafeUrl } from './url-safety';

export type { NetCallbacks } from './types';

export interface NetGrantOptions {
  /**
   * Test seam — override the DNS resolver used for the rebind check.
   * Production code can omit (defaults to Bun.dns).
   */
  readonly resolver?: DnsResolver;
  /** Override the per-plugin concurrency cap. */
  readonly slotsPerPlugin?: number;
}

/**
 * Build the list of net grants for one plugin process. Single-flight cache
 * and concurrency limiter live in the returned closure so two plugins
 * never share coalescing or queue against each other.
 */
export function buildNetGrants(cb: NetCallbacks, opts?: NetGrantOptions) {
  const inFlight = new SingleFlightCache();
  const limiter = new ConcurrencyLimiter({ slotsPerPlugin: opts?.slotsPerPlugin });
  const resolver = opts?.resolver ?? defaultDnsResolver;

  return [
    defineGrant(spec.spec, async (ctx, args) => {
      const scope: NetScope = ctx.grantedScope;
      const url = assertSafeUrl(args.url);
      if (!isHostAllowed(url.hostname, scope.allow)) {
        throw errors.netHostNotAllowed({ host: url.hostname, allow: [...scope.allow] });
      }
      await assertPublicHost(url.hostname, resolver);

      const release = await limiter.acquire(ctx.pluginUid);
      try {
        return await runUnderCoalesce({
          args,
          scope,
          cb,
          resolver,
          inFlight,
          parentSignal: ctx.signal,
        });
      } finally {
        release();
      }
    }),
  ];
}

interface CoalesceContext {
  readonly args: FetchArgs;
  readonly scope: NetScope;
  readonly cb: NetCallbacks;
  readonly resolver: DnsResolver;
  readonly inFlight: SingleFlightCache;
  readonly parentSignal: AbortSignal;
}

/**
 * Wrap the call in single-flight coalescing when the method is safe for
 * it. GET / HEAD are RFC-7231 idempotent; everything else must execute
 * independently — coalescing a POST would let two callers share a
 * server-side side effect.
 */
function runUnderCoalesce(ctx: CoalesceContext): Promise<FetchResult> {
  const { args } = ctx;
  const canCoalesce =
    (args.method === 'GET' || args.method === 'HEAD') && args.singleFlight !== false;
  if (!canCoalesce) {
    return performFetch({
      cb: ctx.cb,
      args,
      scope: ctx.scope,
      parentSignal: ctx.parentSignal,
      resolver: ctx.resolver,
    });
  }
  return ctx.inFlight.run(singleFlightKey(args), () =>
    performFetch({
      cb: ctx.cb,
      args,
      scope: ctx.scope,
      parentSignal: ctx.parentSignal,
      resolver: ctx.resolver,
    })
  );
}
