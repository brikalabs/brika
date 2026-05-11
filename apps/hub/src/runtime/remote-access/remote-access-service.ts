/**
 * Top-level remote-access service.
 *
 * Owns the signaling client and the active {@link PeerSession} map. Wires
 * incoming signaling messages to peer sessions, and forwards outbound
 * SDP/ICE from each session back through signaling.
 *
 * Identity model:
 *   - `BRIKA_REMOTE_ACCESS=1` is the env-level gate.
 *   - The hub's *claimed name* and *bearer token* are stored in the OS
 *     keychain (SecretStore) after the user picks a name via the settings UI.
 *     Env vars `BRIKA_REMOTE_NAME` and `BRIKA_REMOTE_TOKEN` override the
 *     keychain values — useful for dev and CI.
 *   - {@link claim} runs the coordinator handshake (POST /v1/hubs/claim),
 *     persists name + token, and bounces the signaling client.
 *
 * Lifecycle:
 *   - `start()` is called from the bootstrap plugin if `config.remoteAccess.enabled`.
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
  enabled: boolean;
  name: string;
  publicOrigin: string;
  state: SignalingState;
  activeSessions: number;
  tokenPresent: boolean;
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

  /** Currently-active name (from keychain or env), populated on start/claim. */
  #activeName = '';
  #client: SignalingClient | null = null;
  #state: SignalingState = 'idle';

  get status(): RemoteAccessStatus {
    return {
      enabled: this.#config.remoteAccess.enabled,
      name: this.#activeName || this.#config.remoteAccess.bootstrapName,
      publicOrigin: derivePublicOrigin(this.#activeName || this.#config.remoteAccess.bootstrapName),
      state: this.#state,
      activeSessions: this.#sessions.size,
      // Status is read-only / not async; the routes layer queries SecretStore separately.
      tokenPresent: false,
    };
  }

  async start(): Promise<void> {
    if (!this.#config.remoteAccess.enabled) {
      this.#log.info('remote access disabled');
      return;
    }
    const { name, token } = await this.#resolveIdentity();
    if (!name) {
      this.#log.info(
        'remote access enabled but no name claimed — claim one via the Remote Access settings page'
      );
      return;
    }
    if (!token) {
      this.#log.warn('remote access has a claimed name but no token — re-claim from the settings page', { name });
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
   * Claim a name with the coordinator, persist the returned token, and
   * bounce the signaling client so it reconnects with fresh credentials.
   *
   * Throws {@link RemoteAccessClaimError} on failure — the caller (HTTP
   * route) maps it to an appropriate response status.
   */
  async claim(name: string): Promise<{ name: string; publicOrigin: string }> {
    if (!this.#config.remoteAccess.enabled) {
      throw new RemoteAccessClaimError(409, 'disabled', 'Remote access is disabled');
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new RemoteAccessClaimError(400, 'invalid-name', 'Name is required');
    }
    const claimUrl = new URL('/v1/hubs/claim', this.#config.remoteAccess.coordinatorOrigin);
    let res: Response;
    try {
      res = await fetch(claimUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
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
    const body = (await res.json()) as { name: string; token: string };
    await this.#secrets.setHubSecret(SIGNALING_NAME_SECRET_KEY, body.name);
    await this.#secrets.setHubSecret(SIGNALING_TOKEN_SECRET_KEY, body.token);

    this.stop();
    await this.start();

    return { name: body.name, publicOrigin: derivePublicOrigin(body.name) };
  }

  /** Persist a fresh bearer token (e.g. after a coordinator-side rotation). */
  async setToken(token: string): Promise<void> {
    await this.#secrets.setHubSecret(SIGNALING_TOKEN_SECRET_KEY, token);
    this.stop();
    await this.start();
  }

  /** Forget the claimed name and bearer token, and disconnect. */
  async forget(): Promise<{ removed: boolean }> {
    this.stop();
    const a = await this.#secrets.deleteHubSecret(SIGNALING_TOKEN_SECRET_KEY);
    const b = await this.#secrets.deleteHubSecret(SIGNALING_NAME_SECRET_KEY);
    this.#activeName = '';
    return { removed: a || b };
  }

  /**
   * Resolution order for the runtime identity:
   *   1. `BRIKA_REMOTE_NAME` / `BRIKA_REMOTE_TOKEN` env vars (dev shortcuts).
   *   2. SecretStore (set by {@link claim}).
   */
  async #resolveIdentity(): Promise<{ name: string; token: string | null }> {
    const envName = process.env.BRIKA_REMOTE_NAME?.trim();
    const envToken = process.env.BRIKA_REMOTE_TOKEN?.trim();
    if (envName && envToken) {
      return { name: envName, token: envToken };
    }
    const storedName =
      envName || ((await this.#secrets.getHubSecret(SIGNALING_NAME_SECRET_KEY)) ?? '');
    const storedToken =
      envToken || (await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY));
    return { name: storedName, token: storedToken ?? null };
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
    const baseOrigin = derivePublicOrigin(this.#activeName) || `http://localhost:${this.#config.port}`;
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
