/**
 * Top-level remote-access service.
 *
 * Owns the signaling client and the active {@link PeerSession} map. Wires
 * incoming signaling messages to peer sessions, and forwards outbound
 * SDP/ICE from each session back through signaling.
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
import { HubConfig } from '@/runtime/config';
import { ApiServer } from '@/runtime/http/api-server';
import { Logger } from '@/runtime/logs/log-router';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { PeerSession } from './peer-session';
import { RpcServer } from './rpc-server';
import { SignalingClient, type SignalingState } from './signaling-client';

/** Secret key used to persist the signaling bearer token in the OS keychain. */
export const SIGNALING_TOKEN_SECRET_KEY = 'remote_access.signaling_token';

const DEFAULT_ICE_SERVERS: ReadonlyArray<IceServer> = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

@singleton()
export class RemoteAccessService {
  readonly #config = inject(HubConfig);
  readonly #log = inject(Logger).withSource('remote-access');
  readonly #apiServer = inject(ApiServer);
  readonly #secrets = inject(SecretStore);
  readonly #sessions = new Map<string, { session: PeerSession; rpc: RpcServer }>();

  #client: SignalingClient | null = null;
  #state: SignalingState = 'idle';

  get status(): {
    enabled: boolean;
    name: string;
    publicOrigin: string;
    state: SignalingState;
    activeSessions: number;
  } {
    return {
      enabled: this.#config.remoteAccess.enabled,
      name: this.#config.remoteAccess.name,
      publicOrigin: this.#config.remoteAccess.publicOrigin,
      state: this.#state,
      activeSessions: this.#sessions.size,
    };
  }

  async start(): Promise<void> {
    const { enabled, name, signalingUrl } = this.#config.remoteAccess;
    if (!enabled) {
      this.#log.info('remote access disabled');
      return;
    }
    if (!name) {
      this.#log.warn('remote access enabled but BRIKA_REMOTE_NAME is empty — not connecting');
      return;
    }

    // Token resolution order:
    //   1. BRIKA_REMOTE_TOKEN env var (dev/CI shortcut, never recommended in prod).
    //   2. OS keychain via SecretStore (set by the settings UI on enable).
    const envToken = process.env.BRIKA_REMOTE_TOKEN?.trim();
    const token = envToken && envToken.length > 0
      ? envToken
      : await this.#secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY);
    if (!token) {
      this.#log.warn(
        'remote access enabled but no signaling token found — set one via the Remote Access settings page or BRIKA_REMOTE_TOKEN'
      );
      return;
    }

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

  stop(): void {
    for (const { session, rpc } of this.#sessions.values()) {
      rpc.shutdown();
      session.close();
    }
    this.#sessions.clear();
    this.#client?.stop();
    this.#client = null;
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
    const baseOrigin = this.#config.remoteAccess.publicOrigin || `https://${this.#config.remoteAccess.name}.brika.dev`;
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
