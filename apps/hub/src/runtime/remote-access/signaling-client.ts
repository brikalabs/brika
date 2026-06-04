/**
 * Outbound WebSocket connection to the remote-access coordinator.
 *
 * Responsibilities:
 *   - Maintain a single long-lived WebSocket to `signalingUrl`.
 *   - Authenticate via a bearer token in the `Sec-WebSocket-Protocol` subprotocol
 *     (works around the lack of a real HTTP header API on browser WebSocket).
 *   - Send a {@link HubRegisterMessage} as the first frame after connect.
 *   - Reconnect with exponential backoff on disconnect.
 *   - Surface incoming signaling frames to a handler.
 *
 * The class never touches WebRTC directly — its only job is to be a
 * versioned, validated message pipe.
 */

import {
  decodeSignaling,
  encodeSignaling,
  PROTOCOL_VERSION,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import type { Json } from '@/types';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER = 0.25;

export interface SignalingClientOptions {
  readonly url: string;
  readonly token: string;
  readonly hubName: string;
  readonly hubVersion: string;
  readonly caps?: ReadonlyArray<string>;
  /**
   * Called for every received frame after version/kind validation. Errors
   * thrown from here are caught and logged — they must not crash the WS loop.
   */
  readonly onMessage: (msg: SignalingMessage) => void;
  readonly onStateChange?: (state: SignalingState) => void;
  readonly log: SignalingLogger;
}

export type SignalingState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface SignalingLogger {
  info: (message: string, meta?: Record<string, Json>) => void;
  warn: (message: string, meta?: Record<string, Json>) => void;
  error: (message: string, meta?: Record<string, Json>) => void;
}

export class SignalingClient {
  readonly #options: SignalingClientOptions;
  #ws: WebSocket | null = null;
  #state: SignalingState = 'idle';
  #stopped = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SignalingClientOptions) {
    this.#options = options;
  }

  get state(): SignalingState {
    return this.#state;
  }

  start(): void {
    if (this.#stopped) {
      throw new Error('SignalingClient already stopped');
    }
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#ws) {
      try {
        this.#ws.close(1000, 'shutdown');
      } catch {
        // ignore
      }
      this.#ws = null;
    }
    this.#setState('closed');
  }

  /** Send a signaling frame. Silently drops if the socket is not open. */
  send(msg: SignalingMessage): boolean {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.#ws.send(encodeSignaling(msg));
      return true;
    } catch (err) {
      this.#options.log.warn('signaling send failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  #setState(state: SignalingState): void {
    if (this.#state === state) {
      return;
    }
    this.#state = state;
    this.#options.onStateChange?.(state);
  }

  #connect(): void {
    if (this.#stopped) {
      return;
    }
    this.#setState(this.#reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    const { url, token } = this.#options;

    let ws: WebSocket;
    try {
      // The bearer token rides as a WebSocket subprotocol so it travels in the
      // `Sec-WebSocket-Protocol` header. The coordinator inspects this on
      // upgrade and rejects the connection on mismatch.
      ws = new WebSocket(url, [`brika.v${PROTOCOL_VERSION}`, `bearer.${token}`]);
    } catch (err) {
      this.#options.log.error('signaling connect threw', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.#scheduleReconnect();
      return;
    }

    this.#ws = ws;
    ws.addEventListener('open', () => this.#onOpen());
    ws.addEventListener('message', (ev) => {
      // Bun WebSocket leaves `origin` empty for client-spawned sockets.
      // Drop frames that carry a populated origin — the connection
      // handshake authenticates this socket; a populated origin signals
      // an intermediary tampering with the message stream.
      if (ev.origin && ev.origin !== '') {
        return;
      }
      this.#onMessage(ev);
    });
    ws.addEventListener('close', (ev) => this.#onClose(ev));
    ws.addEventListener('error', (ev) => this.#onError(ev));
  }

  #onOpen(): void {
    this.#reconnectAttempt = 0;
    this.#setState('connected');
    this.#options.log.info('signaling connected', { url: this.#options.url });

    this.send({
      v: PROTOCOL_VERSION,
      kind: 'hub.register',
      name: this.#options.hubName,
      hubVersion: this.#options.hubVersion,
      ...(this.#options.caps && { caps: this.#options.caps }),
    });
  }

  #onMessage(ev: MessageEvent): void {
    const raw = typeof ev.data === 'string' ? ev.data : null;
    if (!raw) {
      return;
    }
    const msg = decodeSignaling(raw);
    if (!msg) {
      this.#options.log.warn('signaling: dropped malformed/wrong-version frame');
      return;
    }
    try {
      this.#options.onMessage(msg);
    } catch (err) {
      this.#options.log.error('signaling handler threw', {
        error: err instanceof Error ? err.message : String(err),
        kind: msg.kind,
      });
    }
  }

  #onClose(ev: CloseEvent): void {
    this.#options.log.warn('signaling closed', { code: ev.code, reason: ev.reason });
    this.#ws = null;
    if (!this.#stopped) {
      this.#scheduleReconnect();
    }
  }

  #onError(_ev: Event): void {
    this.#options.log.warn('signaling errored');
    // The 'close' event always follows; reconnect logic lives there.
  }

  #scheduleReconnect(): void {
    if (this.#stopped) {
      return;
    }
    this.#reconnectAttempt += 1;
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (this.#reconnectAttempt - 1));
    const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
    const delay = Math.max(RECONNECT_BASE_MS, Math.round(base + jitter));
    this.#options.log.info('signaling reconnect scheduled', {
      attempt: this.#reconnectAttempt,
      delayMs: delay,
    });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, delay);
  }
}
