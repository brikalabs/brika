/**
 * `ctx.dns.*` — hub-mediated DNS resolution.
 *
 * Plugins never reach `Bun.dns` or `node:dns` directly (both scrubbed by
 * the prelude lockdown). All DNS queries flow through these grants so
 * the hub can:
 *   - check the queried name against the plugin's allow-list
 *   - filter answers that point at private / loopback / link-local IPs
 *     (so a permitted hostname can't be DNS-rebound to internal space)
 *   - keep an audit trail
 *
 * Multiple grants share one `dns` permission family so a single scope
 * (`{allow: [...]}`) governs every DNS verb the plugin uses.
 */

import { defineGrant, type PermissionGate } from '@brika/grants';
import { z } from 'zod';

// ─── Shared scope ────────────────────────────────────────────────────────────

export const DnsScopeSchema = z.object({
  /**
   * Hostnames the plugin may query. Same pattern grammar as the net
   * scope: literal host (`api.example.com`) or one-level subdomain
   * wildcard (`*.example.com`). The wildcard does NOT match the bare
   * suffix — operators must list both if they want it.
   */
  allow: z.array(z.string()),
});

export type DnsScope = z.infer<typeof DnsScopeSchema>;

/**
 * Permission gate shared by every dns verb. We declare it once so the
 * three specs below stay in sync without copy-paste, and so an operator
 * who allow-lists a host for `dns` automatically gets it across
 * `lookup`, `resolveTxt`, and `resolveMx`.
 *
 * Explicit `PermissionGate<typeof DnsScopeSchema>` typing keeps the
 * `mutability` inference loose enough for the three `defineGrant`
 * permission fields below — `as const` here would over-narrow.
 */
const DnsPermission: PermissionGate<typeof DnsScopeSchema> = {
  name: 'dns',
  scope: DnsScopeSchema,
  defaultScope: { allow: [] },
  icon: 'globe-2',
};

// ─── lookup (A / AAAA) ───────────────────────────────────────────────────────

export const DnsLookupArgsSchema = z.object({
  hostname: z.string().min(1).max(253),
  /**
   * Family filter: 4 = IPv4 only, 6 = IPv6 only, 0 = both. Mirrors
   * `node:dns.lookup`'s `family` option.
   */
  family: z.union([z.literal(0), z.literal(4), z.literal(6)]).default(0),
});
export const DnsLookupResultSchema = z.object({
  /** Resolved addresses. Empty array if every record was filtered. */
  addresses: z.array(
    z.object({
      address: z.string(),
      family: z.union([z.literal(4), z.literal(6)]),
    })
  ),
});

export type DnsLookupArgs = z.infer<typeof DnsLookupArgsSchema>;
export type DnsLookupResult = z.infer<typeof DnsLookupResultSchema>;

export const dnsLookup = defineGrant(
  {
    id: 'dev.brika.dns.lookup',
    args: DnsLookupArgsSchema,
    result: DnsLookupResultSchema,
    permission: DnsPermission,
    description: 'Resolve a hostname to its A and AAAA records.',
  },
  () => {
    throw new Error('dns.lookup: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── resolveTxt ──────────────────────────────────────────────────────────────

export const DnsResolveTxtArgsSchema = z.object({
  hostname: z.string().min(1).max(253),
});
export const DnsResolveTxtResultSchema = z.object({
  /**
   * Each TXT record is an array of strings (a record can be split into
   * multiple character-strings on the wire; we surface that structure).
   */
  records: z.array(z.array(z.string())),
});

export type DnsResolveTxtArgs = z.infer<typeof DnsResolveTxtArgsSchema>;
export type DnsResolveTxtResult = z.infer<typeof DnsResolveTxtResultSchema>;

export const dnsResolveTxt = defineGrant(
  {
    id: 'dev.brika.dns.resolveTxt',
    args: DnsResolveTxtArgsSchema,
    result: DnsResolveTxtResultSchema,
    permission: DnsPermission,
    description: 'Resolve TXT records for a hostname.',
  },
  () => {
    throw new Error('dns.resolveTxt: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── resolveMx ───────────────────────────────────────────────────────────────

export const DnsResolveMxArgsSchema = z.object({
  hostname: z.string().min(1).max(253),
});
export const DnsResolveMxResultSchema = z.object({
  records: z.array(
    z.object({
      priority: z.number().int().nonnegative(),
      exchange: z.string(),
    })
  ),
});

export type DnsResolveMxArgs = z.infer<typeof DnsResolveMxArgsSchema>;
export type DnsResolveMxResult = z.infer<typeof DnsResolveMxResultSchema>;

export const dnsResolveMx = defineGrant(
  {
    id: 'dev.brika.dns.resolveMx',
    args: DnsResolveMxArgsSchema,
    result: DnsResolveMxResultSchema,
    permission: DnsPermission,
    description: 'Resolve MX records for a hostname.',
  },
  () => {
    throw new Error('dns.resolveMx: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    dns: {
      lookup(args: DnsLookupArgs): Promise<DnsLookupResult>;
      resolveTxt(args: DnsResolveTxtArgs): Promise<DnsResolveTxtResult>;
      resolveMx(args: DnsResolveMxArgs): Promise<DnsResolveMxResult>;
    };
  }
}
