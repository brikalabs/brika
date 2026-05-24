/**
 * `ctx.dns.resolveTxt` handler — return TXT records for a hostname.
 *
 * TXT records don't carry IPs, so the private-IP filter doesn't apply
 * here. Scope still does: the queried hostname must match the plugin's
 * `dns:allow` list.
 *
 * Bun ships `Bun.dns.resolveTxt` which returns `string[][]` — each
 * record is an array of strings because a TXT record can be split into
 * multiple character-strings on the wire (RFC 1035 §3.3.14). We pass
 * that structure through unchanged.
 */

import { defineGrant } from '@brika/grants';
import {
  type DnsResolveTxtArgs,
  type DnsResolveTxtResult,
  type DnsScope,
  dnsResolveTxt as spec,
} from '@brika/sdk/grants';
import { assertHostAllowed } from '../net/host-allow';

export type DnsTxtResolver = (host: string) => Promise<ReadonlyArray<ReadonlyArray<string>>>;

/**
 * `Bun.dns.resolveTxt` exists at runtime but isn't in `bun-types` yet.
 * We read the slot through `Reflect.get` (returns `unknown`) and narrow
 * with typeof + array shape checks — no `as` cast.
 */
export const defaultTxtResolver: DnsTxtResolver = async (host) => {
  const fn = Reflect.get(Bun.dns, 'resolveTxt');
  if (typeof fn !== 'function') {
    throw new TypeError('Bun.dns.resolveTxt is not available on this Bun version');
  }
  const raw: unknown = await fn(host);
  return narrowTxtRecords(raw);
};

function narrowTxtRecords(raw: unknown): ReadonlyArray<ReadonlyArray<string>> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[][] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const strings: string[] = [];
    for (const s of entry) {
      if (typeof s === 'string') {
        strings.push(s);
      }
    }
    out.push(strings);
  }
  return out;
}

export function buildResolveTxtGrant(resolver: DnsTxtResolver = defaultTxtResolver) {
  return defineGrant(
    spec.spec,
    async (ctx, args: DnsResolveTxtArgs): Promise<DnsResolveTxtResult> => {
      const scope: DnsScope = ctx.grantedScope;
      assertHostAllowed(args.hostname, scope.allow);
      const records = await resolver(args.hostname);
      return { records: records.map((r) => [...r]) };
    }
  );
}
