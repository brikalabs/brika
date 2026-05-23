/**
 * `Bun.dns.*` proxies on top of `ctx.dns.*` grants.
 *
 * The prelude lockdown scrubs every method on `Bun.dns` (lookup, resolve*,
 * reverse, …) to a deny stub. This module re-installs the three the SDK
 * currently models — `lookup`, `resolveTxt`, `resolveMx` — as grant-
 * mediated proxies, so libraries that import `Bun.dns.lookup` (or
 * `node:dns`, which Bun resolves to `Bun.dns` internals) keep working
 * within the plugin's allow-list.
 *
 * The remaining `Bun.dns.*` methods stay scrubbed; plugins needing
 * `resolveSrv`, `resolveCaa`, etc. will get a clear `PERMISSION_DENIED`
 * pointing at the relevant `ctx.dns.*` once we add them.
 */

import type { Channel } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';
import {
  type DnsLookupArgs,
  type DnsLookupResult,
  DnsLookupResultSchema,
  type DnsResolveMxArgs,
  type DnsResolveMxResult,
  DnsResolveMxResultSchema,
  type DnsResolveTxtArgs,
  type DnsResolveTxtResult,
  DnsResolveTxtResultSchema,
} from '@brika/sdk/grants';

const DNS_LOOKUP_GRANT_ID = 'dev.brika.dns.lookup';
const DNS_RESOLVE_TXT_GRANT_ID = 'dev.brika.dns.resolveTxt';
const DNS_RESOLVE_MX_GRANT_ID = 'dev.brika.dns.resolveMx';

export interface DnsProxyDeps {
  readonly channel: Channel;
}

/**
 * Build the trio of `Bun.dns` method proxies. Returned shape mirrors
 * what `Bun.dns` exposes today; the prelude installs each entry via
 * `swapInProxy('Bun.dns', key, proxy)`.
 */
export function buildDnsProxies(deps: DnsProxyDeps): {
  lookup: BunLookup;
  resolveTxt: BunResolveTxt;
  resolveMx: BunResolveMx;
} {
  return {
    lookup: buildLookupProxy(deps.channel),
    resolveTxt: buildResolveTxtProxy(deps.channel),
    resolveMx: buildResolveMxProxy(deps.channel),
  };
}

// ─── lookup ─────────────────────────────────────────────────────────────────

/**
 * Mirrors `Bun.dns.lookup`. The Bun signature returns
 * `Promise<DNSLookup[]>` when called with `{backend: 'system'}`; we mirror
 * the same shape, but `family` honours the call argument (0 = both).
 */
export type BunLookup = (
  hostname: string,
  options?: { family?: 0 | 4 | 6 }
) => Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>>;

function buildLookupProxy(channel: Channel): BunLookup {
  return async (hostname, options) => {
    const args: DnsLookupArgs = {
      hostname,
      family: options?.family ?? 0,
    };
    const result = await callGrant<DnsLookupResult>(
      channel,
      DNS_LOOKUP_GRANT_ID,
      args,
      DnsLookupResultSchema.parse
    );
    return result.addresses;
  };
}

// ─── resolveTxt ─────────────────────────────────────────────────────────────

export type BunResolveTxt = (hostname: string) => Promise<ReadonlyArray<ReadonlyArray<string>>>;

function buildResolveTxtProxy(channel: Channel): BunResolveTxt {
  return async (hostname) => {
    const args: DnsResolveTxtArgs = { hostname };
    const result = await callGrant<DnsResolveTxtResult>(
      channel,
      DNS_RESOLVE_TXT_GRANT_ID,
      args,
      DnsResolveTxtResultSchema.parse
    );
    return result.records;
  };
}

// ─── resolveMx ──────────────────────────────────────────────────────────────

export type BunResolveMx = (
  hostname: string
) => Promise<ReadonlyArray<{ priority: number; exchange: string }>>;

function buildResolveMxProxy(channel: Channel): BunResolveMx {
  return async (hostname) => {
    const args: DnsResolveMxArgs = { hostname };
    const result = await callGrant<DnsResolveMxResult>(
      channel,
      DNS_RESOLVE_MX_GRANT_ID,
      args,
      DnsResolveMxResultSchema.parse
    );
    return result.records;
  };
}

// ─── shared call helper ─────────────────────────────────────────────────────

/**
 * Issue one grant call and re-parse the result. The wire `result` field
 * is `unknown` (each grant validates its own shape on the hub side); we
 * re-parse here so the return narrows without an `as` cast.
 */
async function callGrant<R>(
  channel: Channel,
  id: string,
  args: unknown,
  parse: (raw: unknown) => R
): Promise<R> {
  const response = await channel.call(grantRequest, { id, args });
  return parse(response.result);
}
