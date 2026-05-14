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
  // Anchored IPv4 patterns — `bare.startsWith('10.')` would otherwise match
  // attacker-controlled `10.0.0.1.evil.com` and enable a DNS-rebinding bypass.
  if (/^10(?:\.\d{1,3}){3}$/.test(bare)) {
    return true;
  }
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(bare)) {
    return true;
  }
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(bare)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(bare)) {
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

function isBrikaPublicHost(host: string): boolean {
  const bare = stripPort(host).toLowerCase();
  // Every remote request reaches the hub through the WebRTC bridge with
  // `hub.brika.dev` as the synthesized Host. We don't accept the product
  // domain itself (`brika.dev`, `clay.brika.dev`, etc.) since hubs never
  // legitimately receive requests under those Host values.
  return bare === 'hub.brika.dev';
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
    // Any `*.brika.dev` Host is acceptable — the data-channel transport
    // synthesizes that Host based on the hub's claimed name and the underlying
    // RPC frames carry their own auth.
    if (isBrikaPublicHost(host)) {
      await next();
      return;
    }
    return c.json({ error: 'Misdirected request' }, 421);
  };
}
