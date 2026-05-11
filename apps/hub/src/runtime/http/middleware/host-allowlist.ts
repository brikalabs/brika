/**
 * Host header allowlist middleware.
 *
 * Rejects requests whose `Host` header does not match the configured LAN
 * binding or the optional public remote-access origin. Mitigates DNS rebinding
 * attacks and Host-header confusion when the hub is reachable from multiple
 * origins (LAN + remote subdomain).
 *
 * Loopback hosts (`127.0.0.1`, `localhost`, `::1`) are always allowed so that
 * local development and the in-process RPC bridge keep working.
 */

import type { Middleware } from '@brika/router';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export interface HostAllowlistOptions {
  /** Explicit hostnames or `hostname:port` values that are accepted. */
  readonly allowed: ReadonlyArray<string>;
  /** Also accept any private-network IP (10/8, 172.16/12, 192.168/16, link-local). */
  readonly allowPrivateNetworks?: boolean;
}

function stripPort(host: string): string {
  // IPv6 literal: [::1]:8080
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

function isPrivateNetwork(host: string): boolean {
  const bare = stripPort(host).toLowerCase();
  // IPv4 private ranges
  if (bare.startsWith('10.') || bare.startsWith('192.168.') || bare.startsWith('169.254.')) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(bare)) {
    return true;
  }
  // IPv6 unique-local fc00::/7 and link-local fe80::/10
  if (bare.startsWith('[fc') || bare.startsWith('[fd')) {
    return true;
  }
  if (/^\[fe[89ab]/.test(bare)) {
    return true;
  }
  // .local mDNS names
  if (bare.endsWith('.local')) {
    return true;
  }
  return false;
}

export function hostAllowlist(options: HostAllowlistOptions): Middleware {
  const { allowed, allowPrivateNetworks = true } = options;
  // Normalize allowlist to lowercase exact matches on `host[:port]` AND bare host.
  const set = new Set<string>();
  for (const entry of allowed) {
    if (!entry) {
      continue;
    }
    const lower = entry.toLowerCase();
    set.add(lower);
    set.add(stripPort(lower));
  }

  return async (c, next) => {
    const host = c.req.header('host')?.toLowerCase();
    if (!host) {
      return c.json({ error: 'Misdirected request' }, 421);
    }
    const bare = stripPort(host);
    if (LOOPBACK_HOSTS.has(bare)) {
      await next();
      return;
    }
    if (set.has(host) || set.has(bare)) {
      await next();
      return;
    }
    if (allowPrivateNetworks && isPrivateNetwork(host)) {
      await next();
      return;
    }
    return c.json({ error: 'Misdirected request' }, 421);
  };
}
