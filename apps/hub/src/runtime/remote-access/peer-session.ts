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
  type BinaryChunkKind,
  decodeBinaryChunk,
  decodeRpc,
  encodeBinaryChunk,
  encodeRpc,
  type IceCandidate,
  PROTOCOL_VERSION,
  RPC_CAPABILITIES,
  type RpcMessage,
} from '@brika/remote-access-protocol';
import { type RTCDataChannel, RTCPeerConnection } from 'werift';
import type { SignalingLogger } from './signaling-client';

/**
 * Outbound API the RPC handler uses to push frames at the peer. The session
 * owns the data-channel send path. `peerSupportsBinary()` is polled live —
 * its value flips from `false` to `true` when the peer's hello arrives, and
 * the dispatcher reads it at request-start to decide which wire form to use.
 */
export interface RpcSender {
  send(frame: RpcMessage): void;
  sendBinaryChunk(kind: BinaryChunkKind, id: number, bytes: Uint8Array): void;
  peerSupportsBinary(): boolean;
}

export type RpcHandler = (msg: RpcMessage, sender: RpcSender) => void;

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
/** Minimum gap between repeated malformed-frame WARN logs from one session. */
const MALFORMED_LOG_INTERVAL_MS = 5_000;

export class PeerSession {
  readonly #options: PeerSessionOptions;
  readonly #pc: RTCPeerConnection;
  #channel: RTCDataChannel | null = null;
  #idleTimer: ReturnType<typeof setTimeout> | null = null;
  #closed = false;
  #peerSupportsBinary = false;
  #malformedDropped = 0;
  #lastMalformedLogAt = 0;
  readonly #sender: RpcSender;

  constructor(options: PeerSessionOptions) {
    this.#options = options;
    this.#sender = {
      send: (frame) => this.#send(frame),
      sendBinaryChunk: (kind, id, bytes) => this.#sendBinaryChunk(kind, id, bytes),
      peerSupportsBinary: () => this.#peerSupportsBinary,
    };
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
      // `disconnected` is recoverable per WebRTC spec — ICE may re-establish
      // without a new SDP exchange. Let werift's ICE agent decide whether
      // connectivity is truly lost (escalates `disconnected` → `failed`).
      if (state === 'closed' || state === 'failed') {
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
      if (typeof data === 'string') {
        this.#handleText(data);
      } else {
        this.#handleBinary(data);
      }
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
      // Advertise everything we can decode. The peer flips on binary sends
      // once it sees this in its own `handle` for our hello.
      caps: [RPC_CAPABILITIES.BINARY_FRAMES],
    });
  }

  #handleText(raw: string): void {
    const msg = decodeRpc(raw);
    if (!msg) {
      this.#warnMalformed('dropped malformed/wrong-version frame');
      return;
    }
    // One-way capability ratchet: a peer that advertised binary may not
    // un-advertise within the session, so we never downgrade.
    if (msg.kind === 'hello' && msg.caps?.includes(RPC_CAPABILITIES.BINARY_FRAMES)) {
      this.#peerSupportsBinary = true;
    }
    this.#options.onRpc(msg, this.#sender);
  }

  #handleBinary(data: Buffer): void {
    // werift hands us a Node Buffer; copy into a fresh ArrayBuffer so the
    // decoded slice owns its bytes — Buffer pooling can otherwise alias the
    // payload across subsequent reads.
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const chunk = decodeBinaryChunk(ab);
    if (!chunk) {
      this.#warnMalformed('dropped malformed binary frame');
      return;
    }
    // Synthesize a chunk message so the RpcServer's normal switch arm
    // handles both wire forms — no separate binary dispatch path needed.
    this.#options.onRpc(
      {
        v: PROTOCOL_VERSION,
        kind: chunk.kind,
        id: chunk.id,
        dataBin: chunk.payload,
      },
      this.#sender
    );
  }

  /**
   * Rate-limited malformed-frame log. A peer can stream undecodable bytes
   * indefinitely; without rate-limiting, every frame triggers a structured-
   * log call and amplifies into a logger-pipeline DoS even though the byte
   * volume is bounded by SCTP.
   */
  #warnMalformed(reason: string): void {
    this.#malformedDropped++;
    if (this.#malformedDropped === 1) {
      this.#options.log.warn(`rpc: ${reason}`, { sessionId: this.#options.sessionId });
      return;
    }
    const now = Date.now();
    if (now - this.#lastMalformedLogAt < MALFORMED_LOG_INTERVAL_MS) {
      return;
    }
    this.#lastMalformedLogAt = now;
    this.#options.log.warn(`rpc: ${reason} (${this.#malformedDropped} dropped this session)`, {
      sessionId: this.#options.sessionId,
    });
  }

  #send(frame: RpcMessage): void {
    this.#sendRaw(encodeRpc(frame), { kind: frame.kind });
  }

  #sendBinaryChunk(kind: BinaryChunkKind, id: number, bytes: Uint8Array): void {
    this.#sendRaw(encodeBinaryChunk(kind, id, bytes), { kind, id, bytes: bytes.byteLength });
  }

  /**
   * Common send path: gates on data-channel state, surfaces a throw as an
   * ERROR-level log. A throw silently truncates the bridged response — the
   * FE never sees `response.end`, the stream just stops mid-body, and the
   * next frame is interpreted as a continuation (the bug that spliced
   * menubar CSS mid-`import` in clay's bundle).
   */
  #sendRaw(payload: string | ArrayBuffer, ctx: Record<string, unknown>): void {
    if (!this.#channel || this.#channel.readyState !== 'open') {
      return;
    }
    try {
      // werift accepts string | Buffer; wrap ArrayBuffer as a zero-copy view.
      this.#channel.send(typeof payload === 'string' ? payload : Buffer.from(payload));
    } catch (err) {
      this.#options.log.error('data channel send failed — frame dropped', {
        sessionId: this.#options.sessionId,
        ...ctx,
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
