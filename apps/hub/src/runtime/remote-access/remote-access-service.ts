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
  type IceServer,
  PROTOCOL_VERSION,
  type RpcMessage,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import { hub } from '@/hub';
import { derivePublicOrigin, HubConfig } from '@/runtime/config';
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

const DEFAULT_ICE_SERVERS: ReadonlyArray<IceServer> = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export interface RemoteAccessStatus {
  /** A claim (name + token) is persisted; the service is or wants to be online. */
  claimed: boolean;
  /** The claimed hub name (empty when not claimed). */
  name: string;
  /** Canonical public URL derived from {@link name}. */
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

  status(): Promise<RemoteAccessStatus> {
    return this.#secrets.getHubSecret(SIGNALING_NAME_SECRET_KEY).then(async (storedName) => {
      const token = await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY);
      const name = storedName ?? '';
      const claimed = Boolean(name && token);
      return {
        claimed,
        name,
        publicOrigin: derivePublicOrigin(name),
        state: this.#state,
        activeSessions: this.#sessions.size,
        coordinatorOrigin: this.#config.remoteAccess.coordinatorOrigin,
      };
    });
  }

  async start(): Promise<void> {
    const name = await this.#secrets.getHubSecret(SIGNALING_NAME_SECRET_KEY);
    const token = await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY);
    if (!name || !token) {
      this.#log.info('remote access not claimed — visit Settings → Remote access to enable');
      return;
    }
    this.#activeName = name;
    this.#startClient(name, token);
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

    return { name: body.name, publicOrigin: derivePublicOrigin(body.name) };
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
    const url = new URL(path, this.#config.remoteAccess.coordinatorOrigin);
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

  #startClient(name: string, token: string): void {
    this.#client = new SignalingClient({
      url: this.#config.remoteAccess.signalingUrl,
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
      signalingUrl: this.#config.remoteAccess.signalingUrl,
    });
  }

  #onSignalingMessage(msg: SignalingMessage): void {
    switch (msg.kind) {
      case 'session.offer':
        void this.#openSession(msg.sessionId, msg.sdp, msg.iceServers);
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
    iceServers: ReadonlyArray<IceServer>
  ): Promise<void> {
    if (this.#sessions.has(sessionId)) {
      this.#log.warn('duplicate session.offer ignored', { sessionId });
      return;
    }
    const servers = iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS;
    const baseOrigin =
      derivePublicOrigin(this.#activeName) || `http://localhost:${this.#config.port}`;
    const rpc = new RpcServer({
      sessionId,
      baseOrigin,
      apiServer: this.#apiServer,
      remoteIp: 'rtc:peer',
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
