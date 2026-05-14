/**
 * Top-level remote-access service.
 *
 * Owns the signaling client and the active {@link PeerSession} map. Wires
 * incoming signaling messages to peer sessions, and forwards outbound
 * SDP/ICE from each session back through signaling.
 *
 * Identity model:
 *   - The hub's *claimed name* and *bearer token* live in the OS keychain
 *     (SecretStore). They are written by {@link claim}, which calls the
 *     coordinator's `POST /v1/hubs/claim` and persists the response.
 *   - There is no separate enable/disable flag — the service is "active"
 *     whenever a claim is present, "idle" otherwise. Users opt in by
 *     claiming a name; they opt out by calling {@link forget}.
 *   - The only relevant env var is `BRIKA_COORDINATOR_URL` (config), which
 *     defaults to the production coordinator.
 *
 * Lifecycle:
 *   - `start()` is called from the bootstrap plugin and is always safe to
 *     invoke. When there's no claim, it logs once and does nothing.
 *   - `stop()` tears everything down on shutdown.
 *
 * The service is intentionally tolerant of a missing coordinator: if the
 * signaling URL is unreachable, the client keeps reconnecting silently and
 * does not block hub startup.
 */

import { inject, singleton } from '@brika/di';
import {
  DEFAULT_ICE_SERVERS,
  type IceServer,
  PROTOCOL_VERSION,
  type RpcMessage,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import { hub } from '@/hub';
import { derivePublicOrigin, deriveSignalingUrl, HubConfig } from '@/runtime/config';
import { ApiServer } from '@/runtime/http/api-server';
import { Logger } from '@/runtime/logs/log-router';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { PeerSession } from './peer-session';
import { RpcServer } from './rpc-server';
import { SignalingClient, type SignalingState } from './signaling-client';

/** Secret key used to persist the signaling bearer token in the OS keychain. */
export const SIGNALING_TOKEN_SECRET_KEY = 'remote_access.signaling_token';
/** Secret key used to persist the claimed hub name. */
export const SIGNALING_NAME_SECRET_KEY = 'remote_access.hub_name';
/**
 * Secret-store key for the coordinator HTTP origin. Persisted here (rather
 * than in HubConfig) so the operator can change it from the UI without
 * editing env vars or restarting the hub.
 */
export const COORDINATOR_ORIGIN_SECRET_KEY = 'remote_access.coordinator_origin';

export interface RemoteAccessStatus {
  /** A claim (name + token) is persisted; the service is or wants to be online. */
  claimed: boolean;
  /** The claimed hub name (empty when not claimed). */
  name: string;
  /** Canonical share URL: `https://hub.brika.dev/<name>` in production. */
  publicOrigin: string;
  /** Live signaling-client state. */
  state: SignalingState;
  /** Active peer sessions (browsers currently connected). */
  activeSessions: number;
  /** Coordinator HTTP origin in use (for diagnostics). */
  coordinatorOrigin: string;
}

export class RemoteAccessClaimError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RemoteAccessClaimError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Parse `BRIKA_REMOTE_CLAIM` (format `<name>:<token>`). Both halves must be
 * non-empty; anything malformed is treated as "not set" so a typo doesn't
 * silently break startup.
 */
function parseRemoteClaim(raw: string | undefined): { name: string; token: string } | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const sep = trimmed.indexOf(':');
  if (sep <= 0 || sep === trimmed.length - 1) {
    return null;
  }
  const name = trimmed.slice(0, sep).trim();
  const token = trimmed.slice(sep + 1).trim();
  if (!name || !token) {
    return null;
  }
  return { name, token };
}

@singleton()
export class RemoteAccessService {
  readonly #config = inject(HubConfig);
  readonly #log = inject(Logger).withSource('remote-access');
  readonly #apiServer = inject(ApiServer);
  readonly #secrets = inject(SecretStore);
  readonly #sessions = new Map<string, { session: PeerSession; rpc: RpcServer }>();

  /** Currently-active claimed name (loaded from SecretStore on start/claim). */
  #activeName = '';
  #client: SignalingClient | null = null;
  #state: SignalingState = 'idle';

  /**
   * Resolve the active coordinator URL with precedence:
   *   1. SecretStore (set from the UI).
   *   2. `BRIKA_COORDINATOR_URL` env var (config default).
   *
   * Both are validated as URLs at write time, so we trust the stored value.
   */
  async coordinatorOrigin(): Promise<string> {
    const stored = await this.#secrets.getHubSecret(COORDINATOR_ORIGIN_SECRET_KEY);
    return stored?.trim() || this.#config.remoteAccess.coordinatorOrigin;
  }

  /**
   * Persist a new coordinator URL. Caller is responsible for validating the
   * URL parses; we re-validate here as a safety net.
   */
  async setCoordinatorOrigin(origin: string): Promise<{ coordinatorOrigin: string }> {
    let normalized: string;
    try {
      normalized = new URL(origin).origin;
    } catch {
      throw new RemoteAccessClaimError(400, 'invalid-url', `"${origin}" is not a valid URL`);
    }
    await this.#secrets.setHubSecret(COORDINATOR_ORIGIN_SECRET_KEY, normalized);
    // Bounce so any active signaling client picks up the new URL.
    this.stop();
    await this.start();
    return { coordinatorOrigin: normalized };
  }

  /**
   * Probe the configured coordinator's `/v1/health` endpoint. Useful as a
   * "Test connection" affordance in the UI before the user commits to a
   * name claim.
   */
  async testCoordinator(): Promise<{
    ok: boolean;
    status: number;
    coordinatorOrigin: string;
    error?: string;
  }> {
    const coordinatorOrigin = await this.coordinatorOrigin();
    try {
      const res = await fetch(new URL('/v1/health', coordinatorOrigin).toString(), {
        signal: AbortSignal.timeout(5_000),
      });
      return { ok: res.ok, status: res.status, coordinatorOrigin };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        coordinatorOrigin,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async status(): Promise<RemoteAccessStatus> {
    const storedName = await this.#secrets.getHubSecret(SIGNALING_NAME_SECRET_KEY);
    const token = await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY);
    const name = storedName ?? '';
    const coordinatorOrigin = await this.coordinatorOrigin();
    return {
      claimed: Boolean(name && token),
      name,
      publicOrigin: derivePublicOrigin(name, coordinatorOrigin),
      state: this.#state,
      activeSessions: this.#sessions.size,
      coordinatorOrigin,
    };
  }

  async start(): Promise<void> {
    // Identity comes from the OS keychain after a UI-driven claim.
    // BRIKA_REMOTE_CLAIM (formatted `<name>:<token>`) is a CI/test escape
    // hatch that boots the hub against a known coordinator without the
    // keychain round-trip — useful where the OS keychain isn't available.
    const envClaim = parseRemoteClaim(process.env.BRIKA_REMOTE_CLAIM);
    let name =
      envClaim?.name ?? (await this.#secrets.getHubSecret(SIGNALING_NAME_SECRET_KEY)) ?? '';
    let token = envClaim?.token ?? (await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY));

    // Dev-mode auto-claim: if BRIKA_DEV_AUTOCLAIM is set and we don't have a
    // claim yet, claim the requested name against the coordinator and
    // persist the response. Lets the dev loop come up without a manual
    // visit to Settings → Remote access on every fresh worktree.
    if (!name || !token) {
      const dev = await this.#tryAutoClaim();
      if (dev) {
        name = dev.name;
        token = dev.token;
      }
    }

    if (!name || !token) {
      this.#log.info('remote access not claimed — visit Settings → Remote access to enable');
      return;
    }
    this.#activeName = name;
    const origin = await this.coordinatorOrigin();
    this.#startClient(name, token, deriveSignalingUrl(origin));
  }

  async #tryAutoClaim(): Promise<{ name: string; token: string } | null> {
    const requested = process.env.BRIKA_DEV_AUTOCLAIM?.trim();
    if (!requested) {
      return null;
    }
    // Wait up to 30 s for the coordinator to come up — `bun run dev`
    // starts the worker and the hub in parallel, so there's a brief window
    // when /v1/hubs/claim 404s while miniflare is still booting.
    const deadline = Date.now() + 30_000;
    let lastError: unknown = null;
    while (Date.now() < deadline) {
      try {
        const body = await this.#coordinatorRequest<{ name: string; token: string }>(
          'POST',
          '/v1/hubs/claim',
          { name: requested }
        );
        await this.#secrets.setHubSecret(SIGNALING_NAME_SECRET_KEY, body.name);
        await this.#secrets.setHubSecret(SIGNALING_TOKEN_SECRET_KEY, body.token);
        this.#log.info('auto-claimed dev hub name', { name: body.name });
        return body;
      } catch (err) {
        // 409 = name taken — the coordinator is up, retrying won't help.
        if (err instanceof RemoteAccessClaimError && err.status === 409) {
          this.#log.warn('auto-claim failed: name is taken on this coordinator', {
            name: requested,
            hint: 'pick a different BRIKA_DEV_AUTOCLAIM, or release the existing claim',
          });
          return null;
        }
        // 4xx other than 409 are equally non-retriable.
        if (
          err instanceof RemoteAccessClaimError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 408
        ) {
          this.#log.warn('auto-claim failed', { name: requested, error: err.message });
          return null;
        }
        // Otherwise we likely hit a network/coordinator-not-ready error.
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    this.#log.warn('auto-claim timed out waiting for coordinator', {
      name: requested,
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return null;
  }

  stop(): void {
    for (const { session, rpc } of this.#sessions.values()) {
      rpc.shutdown();
      session.close();
    }
    this.#sessions.clear();
    this.#client?.stop();
    this.#client = null;
    this.#state = 'closed';
  }

  /**
   * Claim a name with the coordinator, persist the returned token, and start
   * (or restart) the signaling client.
   *
   * Throws {@link RemoteAccessClaimError} on failure — the caller (HTTP
   * route) maps it to an appropriate response status.
   */
  async claim(name: string): Promise<{ name: string; publicOrigin: string }> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new RemoteAccessClaimError(400, 'invalid-name', 'Name is required');
    }
    const body = await this.#coordinatorRequest<{ name: string; token: string }>(
      'POST',
      '/v1/hubs/claim',
      { name: trimmed }
    );
    await this.#secrets.setHubSecret(SIGNALING_NAME_SECRET_KEY, body.name);
    await this.#secrets.setHubSecret(SIGNALING_TOKEN_SECRET_KEY, body.token);

    this.stop();
    await this.start();

    const coordinatorOrigin = await this.coordinatorOrigin();
    return { name: body.name, publicOrigin: derivePublicOrigin(body.name, coordinatorOrigin) };
  }

  /**
   * Forget the claim entirely: release the name on the coordinator (so it
   * becomes available to other hubs), wipe the OS keychain entries, and
   * disconnect.
   *
   * If the coordinator is unreachable, the local state is still wiped — a
   * stale entry on the coordinator is harmless and can be cleaned up later.
   */
  async forget(): Promise<{ removed: boolean; coordinatorReleased: boolean }> {
    const name = await this.#secrets.getHubSecret(SIGNALING_NAME_SECRET_KEY);
    const token = await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY);

    let coordinatorReleased = false;
    if (name && token) {
      try {
        await this.#coordinatorRequest(
          'DELETE',
          `/v1/hubs/${encodeURIComponent(name)}`,
          undefined,
          token
        );
        coordinatorReleased = true;
      } catch (err) {
        this.#log.warn('coordinator release failed; clearing local state anyway', {
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.stop();
    const a = await this.#secrets.deleteHubSecret(SIGNALING_TOKEN_SECRET_KEY);
    const b = await this.#secrets.deleteHubSecret(SIGNALING_NAME_SECRET_KEY);
    this.#activeName = '';

    return { removed: a || b, coordinatorReleased };
  }

  /**
   * Talk to the coordinator's HTTP API. Centralized for consistent error
   * mapping into {@link RemoteAccessClaimError}.
   */
  async #coordinatorRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    bearer?: string
  ): Promise<T> {
    const origin = await this.coordinatorOrigin();
    const url = new URL(path, origin);
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
    }
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new RemoteAccessClaimError(
        502,
        'coordinator-unreachable',
        err instanceof Error ? err.message : String(err)
      );
    }
    if (!res.ok) {
      const text = await res.text();
      let parsed: { error?: string; code?: string } = {};
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        // not JSON
      }
      throw new RemoteAccessClaimError(
        res.status,
        parsed.code ?? 'coordinator-error',
        parsed.error ?? (text || res.statusText)
      );
    }
    return (await res.json()) as T;
  }

  #startClient(name: string, token: string, signalingUrl: string): void {
    this.#client = new SignalingClient({
      url: signalingUrl,
      token,
      hubName: name,
      hubVersion: hub.version,
      log: this.#log,
      onStateChange: (state) => {
        this.#state = state;
      },
      onMessage: (msg) => this.#onSignalingMessage(msg),
    });
    this.#client.start();
    this.#log.info('remote access starting', {
      name,
      signalingUrl,
    });
  }

  #onSignalingMessage(msg: SignalingMessage): void {
    switch (msg.kind) {
      case 'session.offer':
        void this.#openSession(msg.sessionId, msg.sdp, msg.iceServers, {
          clientIp: msg.clientIp,
          clientUserAgent: msg.clientUserAgent,
        });
        return;
      case 'session.ice': {
        const entry = this.#sessions.get(msg.sessionId);
        if (entry && msg.from === 'client') {
          void entry.session.addRemoteIce(msg.candidate);
        }
        return;
      }
      case 'session.error':
        this.#log.warn('signaling reported session error', {
          sessionId: msg.sessionId,
          code: msg.code,
          message: msg.message,
        });
        if (msg.sessionId) {
          this.#closeSession(msg.sessionId);
        }
        return;
      // The remaining kinds are not addressed to the hub.
      default:
        return;
    }
  }

  async #openSession(
    sessionId: string,
    offerSdp: string,
    iceServers: ReadonlyArray<IceServer>,
    clientInfo: { clientIp?: string; clientUserAgent?: string } = {}
  ): Promise<void> {
    if (this.#sessions.has(sessionId)) {
      this.#log.warn('duplicate session.offer ignored', { sessionId });
      return;
    }
    const servers = iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
    // Synthesize a stable, allowlisted Host for the in-process Request. This
    // is never exposed to users — the public share URL surfaced in
    // /api/remote-access is composed separately by `derivePublicOrigin`.
    // hub.brika.dev is the canonical coordinator host and matches the CORS
    // + host allowlist on `ApiServer`.
    const baseOrigin = this.#activeName
      ? 'https://hub.brika.dev'
      : `http://localhost:${this.#config.port}`;
    const rpc = new RpcServer({
      sessionId,
      baseOrigin,
      apiServer: this.#apiServer,
      // Prefer the real client IP captured by the signaling server from the
      // WebSocket upgrade — that's what we want in auth-session records and
      // rate-limit buckets. Fall back to `rtc:<sessionId>` if the coordinator
      // didn't supply one (older signaling server, or local in-process tests).
      remoteIp: clientInfo.clientIp || `rtc:${sessionId}`,
      remoteUserAgent: clientInfo.clientUserAgent,
      log: this.#log,
    });

    const session = new PeerSession({
      sessionId,
      iceServers: servers,
      log: this.#log,
      onAnswer: (sdp) => {
        this.#client?.send({
          v: PROTOCOL_VERSION,
          kind: 'hub.answer',
          sessionId,
          sdp,
        });
      },
      onIceCandidate: (candidate) => {
        this.#client?.send({
          v: PROTOCOL_VERSION,
          kind: 'hub.ice',
          sessionId,
          candidate,
        });
      },
      onClosed: () => {
        rpc.shutdown();
        this.#sessions.delete(sessionId);
        this.#log.info('peer session closed', {
          sessionId,
          remaining: this.#sessions.size,
        });
      },
      onRpc: (msg: RpcMessage, send) => rpc.handle(msg, send),
    });

    this.#sessions.set(sessionId, { session, rpc });

    try {
      await session.acceptOffer(offerSdp);
    } catch (err) {
      this.#log.error('failed to accept session offer', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      this.#closeSession(sessionId);
    }
  }

  #closeSession(sessionId: string): void {
    const entry = this.#sessions.get(sessionId);
    if (!entry) {
      return;
    }
    entry.rpc.shutdown();
    entry.session.close();
    this.#sessions.delete(sessionId);
  }
}
