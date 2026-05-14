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
  type DecodedBinaryChunk,
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
 * owns the data-channel send path and decides on the fly whether to use the
 * JSON-text frame or the {@link encodeBinaryChunk} binary frame for body
 * payloads, based on what the peer advertised in `hello.caps`.
 */
export interface RpcSender {
  /** Send a JSON-text RPC frame. Always works. */
  send(frame: RpcMessage): void;
  /**
   * Send a body chunk as a binary frame. The session MUST only call this
   * after {@link peerSupportsBinary} returns `true` — otherwise the peer's
   * decoder won't recognise the frame and the chunk is silently lost.
   */
  sendBinaryChunk(kind: BinaryChunkKind, id: number, bytes: Uint8Array): void;
  /**
   * `true` once the peer's hello has advertised `binary-frames`. Polled at
   * each call site — the value flips from `false` → `true` mid-session as
   * the peer's hello arrives.
   */
  peerSupportsBinary(): boolean;
}

/**
 * Inbound frame variants. Most frames arrive as decoded JSON; raw body bytes
 * arrive as a {@link DecodedBinaryChunk} that the handler routes to the
 * matching assembler directly (no `RpcMessage` is fabricated for them — the
 * binary path bypasses the JSON schema by design).
 */
export type InboundFrame =
  | { readonly kind: 'rpc'; readonly msg: RpcMessage }
  | { readonly kind: 'binary'; readonly chunk: DecodedBinaryChunk };

export type RpcHandler = (frame: InboundFrame, sender: RpcSender) => void;

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
  #peerSupportsBinary = false;
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
      this.#options.log.warn('rpc: dropped malformed/wrong-version frame', {
        sessionId: this.#options.sessionId,
      });
      return;
    }
    // Capture peer caps from their hello so subsequent body chunks can route
    // through the binary path. This is a one-way ratchet — once `true`, we
    // never downgrade for the rest of the session.
    if (msg.kind === 'hello' && msg.caps?.includes(RPC_CAPABILITIES.BINARY_FRAMES)) {
      this.#peerSupportsBinary = true;
    }
    this.#options.onRpc({ kind: 'rpc', msg }, this.#sender);
  }

  #handleBinary(data: Buffer): void {
    // werift hands us a Node Buffer; copy into a fresh ArrayBuffer so the
    // decoded slice owns its bytes — Buffer pooling can otherwise alias the
    // payload across subsequent reads.
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const chunk = decodeBinaryChunk(ab);
    if (!chunk) {
      this.#options.log.warn('rpc: dropped malformed binary frame', {
        sessionId: this.#options.sessionId,
        bytes: data.byteLength,
      });
      return;
    }
    this.#options.onRpc({ kind: 'binary', chunk }, this.#sender);
  }

  #send(frame: RpcMessage): void {
    if (!this.#channel || this.#channel.readyState !== 'open') {
      return;
    }
    try {
      this.#channel.send(encodeRpc(frame));
    } catch (err) {
      // A throw here silently truncates the bridged response — the FE
      // never sees `response.end`, the stream just stops mid-body, and
      // the next frame on the wire is interpreted as a continuation
      // (which is how clay's bundle ended up with menubar CSS spliced
      // mid-`import` statement). Log at error level so this surfaces
      // immediately in the hub logs.
      this.#options.log.error('data channel send failed — frame dropped', {
        sessionId: this.#options.sessionId,
        kind: frame.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  #sendBinaryChunk(kind: BinaryChunkKind, id: number, bytes: Uint8Array): void {
    if (!this.#channel || this.#channel.readyState !== 'open') {
      return;
    }
    try {
      // werift accepts ArrayBuffer for binary data-channel sends.
      this.#channel.send(Buffer.from(encodeBinaryChunk(kind, id, bytes)));
    } catch (err) {
      this.#options.log.error('data channel binary send failed — frame dropped', {
        sessionId: this.#options.sessionId,
        kind,
        id,
        bytes: bytes.byteLength,
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
