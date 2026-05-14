/**
 * Signaling protocol — between hub/browser and the coordinator.
 *
 * The coordinator is a small WebSocket server that brokers WebRTC handshakes.
 * It never sees application traffic: once the data channel is open, the
 * peers talk directly (or via TURN) and the coordinator drops out.
 *
 * Wire format: JSON text frames over WebSocket. Every frame carries `v` and
 * `kind`. Unknown fields are silently ignored to keep the protocol forward-
 * compatible with newer clients.
 */

import type { ProtocolVersion } from './version';

/** Common envelope fields present on every signaling frame. */
export interface SignalingEnvelope {
  /** Protocol major version. Receivers MUST drop frames with mismatched major. */
  readonly v: ProtocolVersion;
}

// ─── Hub → Coordinator ─────────────────────────────────────────────────────

/**
 * Hub announces it is online for a given name. Sent on (re)connect.
 * The coordinator validates the bearer token (out-of-band, in the WS handshake)
 * and records the WS as the canonical hub for `name`.
 */
export interface HubRegisterMessage extends SignalingEnvelope {
  readonly kind: 'hub.register';
  readonly name: string;
  /** Hub software version (informational, for telemetry). */
  readonly hubVersion: string;
  /** Capability flags advertised by the hub (see {@link Capabilities}). */
  readonly caps?: ReadonlyArray<string>;
}

/** Hub answers a client offer. */
export interface HubAnswerMessage extends SignalingEnvelope {
  readonly kind: 'hub.answer';
  /** Session id assigned by the coordinator in the matching `client.offer`. */
  readonly sessionId: string;
  /** SDP answer payload. */
  readonly sdp: string;
}

/** Hub sends a trickled ICE candidate for a session. */
export interface HubIceMessage extends SignalingEnvelope {
  readonly kind: 'hub.ice';
  readonly sessionId: string;
  readonly candidate: IceCandidate;
}

/** Hub asks coordinator to drop a session (unrecoverable error / shutdown). */
export interface HubAbortMessage extends SignalingEnvelope {
  readonly kind: 'hub.abort';
  readonly sessionId: string;
  readonly reason?: string;
}

// ─── Browser → Coordinator ─────────────────────────────────────────────────

/**
 * Browser asks to connect to a hub by name. Coordinator allocates a fresh
 * `sessionId`, forwards the offer to the hub, and routes subsequent ICE
 * frames back and forth.
 */
export interface ClientOfferMessage extends SignalingEnvelope {
  readonly kind: 'client.offer';
  readonly hubName: string;
  /** SDP offer payload. */
  readonly sdp: string;
  /** Capability flags advertised by the client. */
  readonly caps?: ReadonlyArray<string>;
  /** Short-lived ticket issued by the coordinator's HTTP API. */
  readonly ticket: string;
}

/** Browser sends a trickled ICE candidate. */
export interface ClientIceMessage extends SignalingEnvelope {
  readonly kind: 'client.ice';
  readonly sessionId: string;
  readonly candidate: IceCandidate;
}

/** Browser cancels its pending offer. */
export interface ClientAbortMessage extends SignalingEnvelope {
  readonly kind: 'client.abort';
  readonly sessionId: string;
  readonly reason?: string;
}

// ─── Coordinator → Peer ────────────────────────────────────────────────────

/**
 * Coordinator forwards a client offer to the hub, with the assigned session id
 * and ICE server credentials (TURN tokens are short-lived).
 */
export interface SessionOfferMessage extends SignalingEnvelope {
  readonly kind: 'session.offer';
  readonly sessionId: string;
  readonly sdp: string;
  readonly clientCaps?: ReadonlyArray<string>;
  /** ICE servers (STUN + optional TURN) the hub should advertise. */
  readonly iceServers: ReadonlyArray<IceServer>;
  /**
   * Captured by the coordinator from the client's WebSocket upgrade — the
   * hub can never see these directly (the data channel hides the upstream
   * connection). Used as `remoteIp` for rate-limiting + the audit IP stamped
   * onto auth-session records, and as the `user-agent` header on synthesized
   * Requests so the auth flow knows what browser opened the session. Both
   * optional: an older coordinator may not include them.
   */
  readonly clientIp?: string;
  readonly clientUserAgent?: string;
}

/** Coordinator forwards a hub answer to the originating client. */
export interface SessionAnswerMessage extends SignalingEnvelope {
  readonly kind: 'session.answer';
  readonly sessionId: string;
  readonly sdp: string;
  readonly hubCaps?: ReadonlyArray<string>;
}

/** Coordinator forwards an ICE candidate to the other peer. */
export interface SessionIceMessage extends SignalingEnvelope {
  readonly kind: 'session.ice';
  readonly sessionId: string;
  readonly candidate: IceCandidate;
  /** Origin of the candidate from the receiver's perspective. */
  readonly from: 'hub' | 'client';
}

/**
 * Coordinator pushes ICE servers to a freshly-connected client (before the
 * client crafts its offer). Lets us rotate TURN credentials without
 * baking them into the static FE bundle.
 */
export interface SessionIceServersMessage extends SignalingEnvelope {
  readonly kind: 'session.iceServers';
  readonly iceServers: ReadonlyArray<IceServer>;
}

/**
 * Generic error/notice from coordinator. Receivers MUST handle unknown codes
 * gracefully (treat as a soft failure, surface the human message).
 */
export interface SessionErrorMessage extends SignalingEnvelope {
  readonly kind: 'session.error';
  readonly sessionId?: string;
  /** Stable machine-readable code (e.g. 'unknown-hub', 'rate-limited'). */
  readonly code: string;
  readonly message: string;
}

// ─── Shared ────────────────────────────────────────────────────────────────

/**
 * ICE candidate as serialized for transport. Mirrors the `RTCIceCandidateInit`
 * dictionary so both browser and `werift` can consume it directly.
 */
export interface IceCandidate {
  readonly candidate: string;
  readonly sdpMid?: string | null;
  readonly sdpMLineIndex?: number | null;
  readonly usernameFragment?: string | null;
}

/** STUN/TURN server descriptor, shaped like `RTCIceServer`. */
export interface IceServer {
  readonly urls: string | ReadonlyArray<string>;
  readonly username?: string;
  readonly credential?: string;
}

/**
 * Default STUN-only ICE servers. Returned by the coordinator on
 * `/v1/tickets`, used as a fallback by the data-channel client when a
 * ticket omits its own list, and consumed directly by the hub when no
 * other source is configured. Single source of truth — was previously
 * duplicated in 6 different files across the stack.
 *
 * STUN-only is intentional. TURN credentials would need per-user rotation
 * and burn coordinator bandwidth; symmetric-NAT users (~10-15%) fall
 * through to the "couldn't reach" error card until TURN lands.
 */
export const DEFAULT_ICE_SERVERS: ReadonlyArray<IceServer> = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Discriminated union of every signaling frame.
 */
export type SignalingMessage =
  | HubRegisterMessage
  | HubAnswerMessage
  | HubIceMessage
  | HubAbortMessage
  | ClientOfferMessage
  | ClientIceMessage
  | ClientAbortMessage
  | SessionOfferMessage
  | SessionAnswerMessage
  | SessionIceMessage
  | SessionIceServersMessage
  | SessionErrorMessage;

export type SignalingMessageKind = SignalingMessage['kind'];
