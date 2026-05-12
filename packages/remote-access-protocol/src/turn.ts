/**
 * Cloudflare Realtime TURN credentials helper.
 *
 * Mints short-lived (default 10-minute) TURN credentials via Cloudflare's
 * Realtime API. The returned ICE-server list is shaped for direct use in
 * `RTCPeerConnection({ iceServers })` — usernames + credentials embedded.
 *
 * Cost shape: Cloudflare's free tier is 1TB/month of relayed traffic;
 * billed at $0.05/GB beyond. Per-session creds; multiple peer sessions
 * from the same hub each get their own short-lived pair.
 *
 * Falls back to an empty list when `appId` / `token` are missing so
 * callers can transparently degrade to STUN-only.
 */

import type { IceServer } from './signaling';

export interface CloudflareTurnConfig {
  /** Cloudflare Realtime App ID. Empty string disables TURN minting. */
  readonly appId: string;
  /** Cloudflare Realtime App Token (Bearer). */
  readonly token: string;
  /** Credential lifetime in seconds. Default 600 (10 minutes). */
  readonly ttlSeconds?: number;
}

interface CloudflareIceServersResponse {
  readonly iceServers?: {
    readonly urls: string | string[];
    readonly username?: string;
    readonly credential?: string;
  };
}

/**
 * Fetch a fresh set of TURN ICE servers from Cloudflare Realtime.
 *
 * Returns an empty array when:
 *   - `appId` or `token` is unset (TURN disabled — caller falls back to STUN)
 *   - the API call fails for any reason (network, auth, rate-limit)
 *
 * Soft-failure pattern lets the coordinator keep serving STUN-only when
 * Cloudflare is down rather than blocking every ticket mint.
 */
export async function fetchCloudflareIceServers(
  config: CloudflareTurnConfig
): Promise<IceServer[]> {
  if (!config.appId || !config.token) {
    return [];
  }
  const ttl = config.ttlSeconds ?? 600;
  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.appId)}/credentials/generate-ice-servers`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl }),
    });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as CloudflareIceServersResponse;
    if (!body.iceServers) {
      return [];
    }
    // Cloudflare returns a single object with multiple URLs (turn:, turns:,
    // stun:). Normalize to one IceServer entry — RTCPeerConnection accepts
    // the multi-URL shape directly.
    return [
      {
        urls: body.iceServers.urls,
        ...(body.iceServers.username ? { username: body.iceServers.username } : {}),
        ...(body.iceServers.credential ? { credential: body.iceServers.credential } : {}),
      },
    ];
  } catch {
    return [];
  }
}
