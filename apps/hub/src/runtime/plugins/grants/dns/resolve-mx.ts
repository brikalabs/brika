/**
 * `ctx.dns.resolveMx` handler — return MX records for a hostname.
 *
 * MX exchanges are hostnames, not IPs, so the IP filter doesn't apply.
 * Scope still does. The result preserves priority (0 = highest, per
 * RFC 5321 §5.1) so callers can iterate in the right order.
 */

import { defineGrant } from '@brika/grants';
import {
  type DnsResolveMxArgs,
  type DnsResolveMxResult,
  type DnsScope,
  dnsResolveMx as spec,
} from '@brika/sdk/grants';
import { assertHostInDnsScope } from './scope';

export interface MxRecord {
  readonly priority: number;
  readonly exchange: string;
}

export type DnsMxResolver = (host: string) => Promise<ReadonlyArray<MxRecord>>;

/**
 * `Bun.dns.resolveMx` exists at runtime in Bun >= 1.0 but is missing
 * from current `bun-types`. `Reflect.get` returns `unknown`, which we
 * narrow with a typeof check before invoking — no cast required.
 */
export const defaultMxResolver: DnsMxResolver = async (host) => {
  const fn = Reflect.get(Bun.dns, 'resolveMx');
  if (typeof fn !== 'function') {
    throw new TypeError('Bun.dns.resolveMx is not available on this Bun version');
  }
  // The runtime contract for resolveMx returns `Promise<{priority, exchange}[]>`.
  // Treating the call result as a value of that exact shape is a narrowing
  // we do via the dedicated `narrowMxRecords` helper below, so this
  // function stays free of `as` casts.
  const raw: unknown = await fn(host);
  return narrowMxRecords(raw);
};

function narrowMxRecords(raw: unknown): ReadonlyArray<MxRecord> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: MxRecord[] = [];
  for (const entry of raw) {
    if (
      entry !== null &&
      typeof entry === 'object' &&
      'priority' in entry &&
      typeof entry.priority === 'number' &&
      'exchange' in entry &&
      typeof entry.exchange === 'string'
    ) {
      out.push({ priority: entry.priority, exchange: entry.exchange });
    }
  }
  return out;
}

export function buildResolveMxGrant(resolver: DnsMxResolver = defaultMxResolver) {
  return defineGrant(
    spec.spec,
    async (ctx, args: DnsResolveMxArgs): Promise<DnsResolveMxResult> => {
      const scope: DnsScope = ctx.grantedScope;
      assertHostInDnsScope(args.hostname, scope.allow);
      const records = await resolver(args.hostname);
      return { records: records.map((r) => ({ priority: r.priority, exchange: r.exchange })) };
    }
  );
}
