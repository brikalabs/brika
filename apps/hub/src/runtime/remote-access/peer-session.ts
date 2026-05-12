/**
 * A single WebRTC peer session with one browser client.
 *
 * Lifecycle:
 *   1. Coordinator pushes us a `session.offer` → we construct an `RTCPeerConnection`.
 *   2. We accept the remote offer, create an answer, emit it via `onAnswer`.
 *   3. ICE candidates flow both ways through `addRemoteIce` / `onIceCandidate`.
 *   4. The browser opens the data channel; once it's open we serve RPC frames.
 *   5. On `connectionstatechange` to `closed`/`failed`, we self-destruct.
 *
 * The class is intentionally framework-agnostic: it takes callbacks for
 * outbound signaling and an `RpcHandler` for inbound RPC requests. The owning
 * service wires those to the real signaling client + hub app.
 */

import {
  decodeRpc,
  encodeRpc,
  type IceCandidate,
  PROTOCOL_VERSION,
  type RpcMessage,
} from '@brika/remote-access-protocol';
import { type RTCDataChannel, RTCPeerConnection } from 'werift';
import type { SignalingLogger } from './signaling-client';

export type RpcHandler = (msg: RpcMessage, send: (frame: RpcMessage) => void) => void;

export interface PeerSessionOptions {
  readonly sessionId: string;
  readonly iceServers: ReadonlyArray<{
    urls: string | ReadonlyArray<string>;
    username?: string;
    credential?: string;
  }>;
  readonly onAnswer: (sdp: string) => void;
  readonly onIceCandidate: (candidate: IceCandidate) => void;
  readonly onClosed: () => void;
  readonly onRpc: RpcHandler;
  readonly log: SignalingLogger;
  /** Idle timeout (ms): close session if no data-channel traffic for this long. Default 5 min. */
  readonly idleTimeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export class PeerSession {
  readonly #options: PeerSessionOptions;
  readonly #pc: RTCPeerConnection;
  #channel: RTCDataChannel | null = null;
  #idleTimer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;

  constructor(options: PeerSessionOptions) {
    this.#options = options;
    // werift's RTCIceServer takes a single string for `urls`; if the caller
    // supplies an array, expand it into one server entry per URL so we
    // preserve the full set without losing credentials.
    const iceServers = options.iceServers.flatMap((s) => {
      const urls = Array.isArray(s.urls) ? Array.from(s.urls) : [s.urls];
      return urls.map((u) => ({
        urls: u,
        ...(s.username && { username: s.username }),
        ...(s.credential && { credential: s.credential }),
      }));
    });
    this.#pc = new RTCPeerConnection({ iceServers });

    this.#pc.onIceCandidate.subscribe((cand) => {
      if (!cand) {
        return;
      }
      options.onIceCandidate({
        candidate: cand.candidate,
        sdpMid: cand.sdpMid,
        sdpMLineIndex: cand.sdpMLineIndex,
        usernameFragment: cand.usernameFragment,
      });
    });

    this.#pc.connectionStateChange.subscribe((state) => {
      options.log.info('peer connection state', {
        sessionId: options.sessionId,
        state,
      });
      if (state === 'closed' || state === 'failed' || state === 'disconnected') {
        this.close();
      }
    });

    this.#pc.onDataChannel.subscribe((channel) => this.#attachChannel(channel));
  }

  /** Apply the remote SDP offer and produce an answer. */
  async acceptOffer(sdp: string): Promise<void> {
    await this.#pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await this.#pc.createAnswer();
    await this.#pc.setLocalDescription(answer);
    this.#options.onAnswer(answer.sdp);
  }

  /** Trickle ICE: add a candidate received from the remote peer. */
  async addRemoteIce(candidate: IceCandidate): Promise<void> {
    try {
      await this.#pc.addIceCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? undefined,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
        usernameFragment: candidate.usernameFragment ?? undefined,
      });
    } catch (err) {
      this.#options.log.warn('addIceCandidate failed', {
        sessionId: this.#options.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
    this.#channel?.close();
    // pc.close() returns a Promise in werift; fire-and-forget with a logged catch.
    Promise.resolve(this.#pc.close()).catch((err) => {
      this.#options.log.warn('pc.close failed', {
        sessionId: this.#options.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    this.#options.onClosed();
  }

  #attachChannel(channel: RTCDataChannel): void {
    this.#channel = channel;
    this.#resetIdleTimer();

    channel.onMessage.subscribe((data: string | Buffer) => {
      this.#resetIdleTimer();
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      const msg = decodeRpc(raw);
      if (!msg) {
        this.#options.log.warn('rpc: dropped malformed/wrong-version frame', {
          sessionId: this.#options.sessionId,
        });
        return;
      }
      this.#options.onRpc(msg, (frame) => this.#send(frame));
    });

    channel.stateChanged.subscribe((state) => {
      this.#options.log.info('data channel state', {
        sessionId: this.#options.sessionId,
        state,
      });
      if (state === 'open') {
        this.#sendHello();
      } else if (state === 'closed') {
        this.close();
      }
    });

    if (channel.readyState === 'open') {
      this.#sendHello();
    }
  }

  #sendHello(): void {
    this.#send({
      v: PROTOCOL_VERSION,
      kind: 'hello',
      role: 'hub',
      softwareVersion: 'brika-hub',
      maxProtocolVersion: PROTOCOL_VERSION,
    });
  }

  #send(frame: RpcMessage): void {
    if (!this.#channel || this.#channel.readyState !== 'open') {
      return;
    }
    try {
      this.#channel.send(encodeRpc(frame));
    } catch (err) {
      this.#options.log.warn('data channel send failed', {
        sessionId: this.#options.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  #resetIdleTimer(): void {
    if (this.#closed) {
      return;
    }
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
    }
    const timeout = this.#options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.#idleTimer = setTimeout(() => {
      this.#options.log.info('peer session idle, closing', {
        sessionId: this.#options.sessionId,
      });
      this.close();
    }, timeout);
  }
}
