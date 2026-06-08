/**
 * `ctx.dns.lookup` handler — resolve A/AAAA records with private-IP
 * filtering.
 *
 * After the scope check passes, every returned address is run through
 * the same `classifyIp` filter the net grant uses. Private / loopback /
 * link-local addresses are dropped from the result; if the entire
 * answer set was private, the plugin sees an empty array. Operators who
 * legitimately need to resolve internal names should run an opt-in
 * egress proxy rather than relax this filter.
 */

import { defineGrant } from '@brika/grants';
import {
  type DnsLookupArgs,
  type DnsLookupResult,
  type DnsScope,
  dnsLookup as spec,
} from '@brika/sdk/grants';
import { classifyIp, type DnsResolver } from '../net/dns-guard';
import { assertHostAllowed } from '../net/host-allow';

/**
 * Full lookup result before filtering. Mirrors `Bun.dns.lookup` /
 * `node:dns.lookup(host, {all: true})` so the resolver can stub it in
 * tests deterministically without dragging in real DNS.
 */
export interface DnsAddressRecord {
  readonly address: string;
  readonly family: 4 | 6;
}

export type DnsLookupResolver = (
  host: string,
  family: 0 | 4 | 6
) => Promise<ReadonlyArray<DnsAddressRecord>>;

/**
 * Production resolver — Bun's system DNS with all-records and
 * family-filtering applied. Tests pass a stub.
 */
export const defaultLookupResolver: DnsLookupResolver = async (host, family) => {
  const records = await Bun.dns.lookup(host, { backend: 'system' });
  const filtered = family === 0 ? records : records.filter((r) => r.family === family);
  return filtered.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

export function buildLookupGrant(resolver: DnsLookupResolver = defaultLookupResolver) {
  return defineGrant(spec.spec, async (ctx, args: DnsLookupArgs): Promise<DnsLookupResult> => {
    const scope: DnsScope = ctx.grantedScope;
    assertHostAllowed(args.hostname, scope.allow);
    const records = await resolver(args.hostname, args.family);
    const addresses: DnsAddressRecord[] = [];
    for (const record of records) {
      // Drop private/loopback/link-local results — keep the same security
      // model as the net grant. Plugins curious about the suppression
      // can call ctx.net.fetch and see the explicit private-IP error.
      if (classifyIp(record.address) === null) {
        addresses.push({ address: record.address, family: record.family });
      }
    }
    return { addresses };
  });
}
