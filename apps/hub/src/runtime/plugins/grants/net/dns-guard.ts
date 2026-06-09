/**
 * DNS rebinding / SSRF defence.
 *
 * Resolves the request hostname BEFORE handing the URL to `fetch` and
 * rejects any A/AAAA in private, loopback, link-local, multicast, or other
 * reserved ranges. Without this, a domain in the operator's allow-list
 * (`*.example.com`) could be DNS'd to `127.0.0.1`, `169.254.169.254`, or
 * RFC1918 space — every classic SSRF pivot.
 *
 * The check runs on every request, including redirect hops. We accept the
 * extra latency of a forward lookup before each connect — the alternative
 * (trusting fetch to resolve and connect atomically) is a known sandbox
 * escape.
 *
 * Localhost-bound literal IPs (`http://127.0.0.1/`) are also rejected here
 * because URL parsing alone wouldn't catch them — they'd pass the host
 * pattern check if an operator foolishly added `127.0.0.1` to the
 * allow-list. The category logged tells operators exactly which CIDR
 * matched.
 */

import { errors } from '@brika/errors';

/**
 * Async hostname resolver. The default uses Bun's DNS. Tests inject a stub
 * to deterministically simulate rebinds without touching the network.
 */
export type DnsResolver = (host: string) => Promise<ReadonlyArray<string>>;

/** Production resolver — pulls A/AAAA records via Bun.dns. */
export const defaultDnsResolver: DnsResolver = async (host) => {
  // Bun's Bun.dns.lookup returns a single {address, family} entry by default;
  // we request `all: true` to surface every record so a multi-A response
  // with one private IP still gets blocked.
  const records = await Bun.dns.lookup(host, { backend: 'system' });
  return records.map((r) => r.address);
};

/**
 * Classify an IPv4 or IPv6 literal against the forbidden ranges. Returns
 * the matched category name, or `null` if the address is public.
 *
 * Categories follow IANA's Special-Purpose Address Registries (IPv4 +
 * IPv6). The list is intentionally conservative — operators who genuinely
 * need to hit a private endpoint should run an opt-in egress proxy, not
 * relax this filter.
 */
export function classifyIp(ip: string): string | null {
  const v4 = parseIpv4(ip);
  if (v4) {
    return classifyIpv4(v4);
  }
  const v6 = parseIpv6(ip);
  if (v6) {
    return classifyIpv6(v6);
  }
  // Unparseable — treat as suspicious. Real DNS only returns IP literals,
  // so a non-IP here is either a hostname (a bug in the caller) or an
  // exotic Bun.dns return we don't recognize.
  return 'unparseable';
}

/**
 * Resolve `host` and reject if any answer is in a forbidden range. Always
 * checks every returned record — a server with one public and one private
 * answer is still blocked, since fetch could connect to either.
 *
 * KNOWN LIMITATION (TOCTOU): the subsequent `fetch` / WebSocket open
 * performs its OWN DNS lookup, so an attacker who controls an
 * allow-listed domain can return a public address to this guard and a
 * private address to the actual connect within the OS resolver TTL.
 * Mitigating this end-to-end needs the connect routed through a fixed
 * IP (custom dispatcher or socket-level bind) — tracked as a
 * follow-up. The L3 sandbox is the second line of defence: when
 * `allowNetwork: false` in the launcher profile the kernel-level
 * deny on outbound IP sockets blocks the connection even if rebinding
 * succeeds at the resolver level.
 */
export async function assertPublicHost(host: string, resolver: DnsResolver): Promise<void> {
  // Literal IP in the URL? Skip DNS and classify directly.
  const literal = classifyIp(host);
  if (literal === null) {
    // Public IP literal — fine.
    return;
  }
  if (literal !== 'unparseable') {
    throw errors.netPrivateIpBlocked({ host, ip: host, category: literal });
  }
  const addresses = await resolver(host);
  for (const address of addresses) {
    const category = classifyIp(address);
    if (category !== null) {
      throw errors.netPrivateIpBlocked({ host, ip: address, category });
    }
  }
}

/**
 * Strict INVERSE of `assertPublicHost`, for the `net.local` grant: permit ONLY
 * a loopback host on a consented port, and reject everything else. Reuses
 * `classifyIp` so the loopback determination shares one audited code path.
 *
 * Accepts the literal name `localhost` and any loopback IP literal
 * (127.0.0.0/8, ::1). Every other host — public, link-local, or RFC1918,
 * including the 169.254.169.254 metadata endpoint — is rejected, so this can
 * never become an SSRF pivot. Loopback IP literals need no DNS, so there is no
 * rebinding window; `localhost` is trusted as the conventional loopback alias.
 */
export function assertLoopbackHost(url: URL, allowLoopbackPorts: ReadonlyArray<number>): void {
  const host = url.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || classifyIp(host) === 'loopback';
  if (!isLoopback) {
    throw errors.netHostNotAllowed({ host, allow: ['loopback only'] });
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || !allowLoopbackPorts.includes(port)) {
    throw errors.netHostNotAllowed({
      host: `${host}:${url.port || '(default)'}`,
      allow: allowLoopbackPorts.map(String),
    });
  }
}

// ─── IPv4 ───────────────────────────────────────────────────────────────────

function parseIpv4(s: string): [number, number, number, number] | null {
  const parts = s.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    // Reject empty, leading zeros (octal-style), or out-of-range octets.
    if (part.length === 0 || part.length > 3) {
      return null;
    }
    if (part.length > 1 && part.startsWith('0')) {
      return null;
    }
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const n = Number(part);
    if (n < 0 || n > 255) {
      return null;
    }
    octets.push(n);
  }
  return [octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0];
}

/**
 * Forbidden IPv4 range table. Each entry is a predicate over the
 * 4-octet tuple plus the category name. First match wins — order
 * matters only for ranges that could overlap (none do today). The
 * table form keeps `classifyIpv4` flat and well under sonar's
 * cognitive-complexity threshold while staying easy to audit.
 */
const IPV4_FORBIDDEN_RANGES: ReadonlyArray<{
  readonly category: string;
  readonly match: (octets: Ipv4Octets) => boolean;
}> = [
  { category: 'unspecified', match: ([a]) => a === 0 },
  { category: 'rfc1918-10', match: ([a]) => a === 10 },
  { category: 'loopback', match: ([a]) => a === 127 },
  { category: 'link-local', match: ([a, b]) => a === 169 && b === 254 },
  { category: 'rfc1918-172', match: ([a, b]) => a === 172 && b >= 16 && b <= 31 },
  { category: 'rfc1918-192', match: ([a, b]) => a === 192 && b === 168 },
  {
    category: 'rfc6890-protocol-assignments',
    match: ([a, b, c]) => a === 192 && b === 0 && c === 0,
  },
  {
    category: 'rfc5737-documentation',
    match: ([a, b, c]) => a === 192 && b === 0 && c === 2,
  },
  { category: 'rfc2544-benchmark', match: ([a, b]) => a === 198 && (b === 18 || b === 19) },
  {
    category: 'rfc5737-documentation',
    match: ([a, b, c]) => a === 198 && b === 51 && c === 100,
  },
  {
    category: 'rfc5737-documentation',
    match: ([a, b, c]) => a === 203 && b === 0 && c === 113,
  },
  { category: 'multicast', match: ([a]) => a >= 224 && a <= 239 },
  { category: 'reserved', match: ([a]) => a >= 240 },
];

type Ipv4Octets = readonly [number, number, number, number];

function classifyIpv4(octets: Ipv4Octets): string | null {
  for (const range of IPV4_FORBIDDEN_RANGES) {
    if (range.match(octets)) {
      return range.category;
    }
  }
  return null;
}

// ─── IPv6 ───────────────────────────────────────────────────────────────────

/**
 * Parse an IPv6 literal into 8 16-bit groups. Returns null on invalid
 * input. Handles `::` shorthand and embedded IPv4 (`::ffff:1.2.3.4`).
 *
 * Bracket-stripping happens here: URL hostnames for IPv6 ship as
 * `[2001:db8::1]`, but Node's `URL.hostname` returns the raw form without
 * brackets. We tolerate both shapes anyway.
 */
function parseIpv6(input: string): readonly number[] | null {
  const stripped = stripIpv6Brackets(input);
  const normalized = embedIpv4(stripped);
  if (normalized === null) {
    return null;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = splitGroupString(halves[0]);
  const tail = splitGroupString(halves[1]);
  if (halves.length === 1 && head.length !== 8) {
    return null;
  }
  const fillCount = 8 - head.length - tail.length;
  if (halves.length === 2 && fillCount < 0) {
    return null;
  }
  return assembleIpv6Groups(head, tail, halves.length === 2 ? fillCount : 0);
}

function stripIpv6Brackets(input: string): string {
  if (input.startsWith('[') && input.endsWith(']')) {
    return input.slice(1, -1);
  }
  return input;
}

/**
 * If `s` ends in an embedded IPv4 (`...:1.2.3.4`), rewrite it as two
 * 16-bit hex groups so the rest of the parser only deals with `:`-separated
 * groups. Returns null when an embedded IPv4 is present but unparseable.
 */
function embedIpv4(s: string): string | null {
  const lastColon = s.lastIndexOf(':');
  if (lastColon < 0 || !s.slice(lastColon + 1).includes('.')) {
    return s;
  }
  const v4 = parseIpv4(s.slice(lastColon + 1));
  if (!v4) {
    return null;
  }
  const high = (v4[0] << 8) | v4[1];
  const low = (v4[2] << 8) | v4[3];
  return `${s.slice(0, lastColon)}:${high.toString(16)}:${low.toString(16)}`;
}

/**
 * Split one half of an IPv6 string (before/after `::`) into its hex
 * groups. Empty halves (a leading or trailing `::`) become empty arrays.
 */
function splitGroupString(half: string | undefined): readonly string[] {
  if (half === undefined || half === '') {
    return [];
  }
  return half.split(':');
}

function assembleIpv6Groups(
  head: readonly string[],
  tail: readonly string[],
  fillCount: number
): readonly number[] | null {
  const groups: number[] = [];
  for (const part of head) {
    const n = parseGroup(part);
    if (n === null) {
      return null;
    }
    groups.push(n);
  }
  for (let i = 0; i < fillCount; i++) {
    groups.push(0);
  }
  for (const part of tail) {
    const n = parseGroup(part);
    if (n === null) {
      return null;
    }
    groups.push(n);
  }
  return groups.length === 8 ? groups : null;
}

function parseGroup(part: string): number | null {
  if (part.length === 0 || part.length > 4 || !/^[0-9a-fA-F]+$/.test(part)) {
    return null;
  }
  return Number.parseInt(part, 16);
}

function classifyIpv6(groups: readonly number[]): string | null {
  const [g0, g1, g2, g3, g4, g5] = groups;
  // ::/128 — unspecified
  if (groups.every((g) => g === 0)) {
    return 'unspecified';
  }
  // ::1/128 — loopback
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
    return 'loopback';
  }
  // fe80::/10 — link-local
  if (g0 !== undefined && (g0 & 0xffc0) === 0xfe80) {
    return 'ipv6-link-local';
  }
  // fc00::/7 — unique local
  if (g0 !== undefined && (g0 & 0xfe00) === 0xfc00) {
    return 'ipv6-unique-local';
  }
  // ff00::/8 — multicast
  if (g0 !== undefined && (g0 & 0xff00) === 0xff00) {
    return 'ipv6-multicast';
  }
  // ::ffff:0:0/96 — IPv4-mapped: classify the embedded v4
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    const a = ((groups[6] ?? 0) >> 8) & 0xff;
    const b = (groups[6] ?? 0) & 0xff;
    const c = ((groups[7] ?? 0) >> 8) & 0xff;
    const d = (groups[7] ?? 0) & 0xff;
    return classifyIpv4([a, b, c, d]);
  }
  // 64:ff9b::/96 — well-known NAT64 prefix; treat embedded v4 the same
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    const a = ((groups[6] ?? 0) >> 8) & 0xff;
    const b = (groups[6] ?? 0) & 0xff;
    const c = ((groups[7] ?? 0) >> 8) & 0xff;
    const d = (groups[7] ?? 0) & 0xff;
    return classifyIpv4([a, b, c, d]);
  }
  // 2001:db8::/32 — documentation
  if (g0 === 0x2001 && g1 === 0x0db8) {
    return 'ipv6-documentation';
  }
  return null;
}
