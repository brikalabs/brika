/**
 * `globalThis.WebSocket` proxy on top of the `dev.brika.ws.*` grants.
 *
 * Constructor pattern:
 *   new WebSocket(url, protocols?)
 *
 * Returns a `WebSocketProxy` instance that:
 *   - dispatches `ws.connect` to the hub on construction
 *   - forwards `send` / `close` to the hub via grants
 *   - listens for `streamEvent` IPC messages tagged with this handle's
 *     id and surfaces them as `open` / `message` / `close` / `error`
 *     DOM-style events
 *
 * The hub-side scope check rejects the connect call if the URL host
 * isn't in the plugin's `ws:allow` list, so plugins authored against
 * the standard `WebSocket` API get the same security boundary as
 * `ctx.ws.connect`.
 */

import type { Channel } from '@brika/ipc';
import { grantRequest, type StreamEventType, streamEvent } from '@brika/ipc/contract';
import { WsCloseResultSchema, WsConnectResultSchema, WsSendResultSchema } from '@brika/sdk/grants';

type EventHandler = (event: unknown) => void;

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

export interface WebSocketProxyDeps {
  readonly channel: Channel;
}

/**
 * Result of `installWebSocketProxy`: the constructor function plus a
 * cleanup function the prelude can call on shutdown to detach the
 * channel listener.
 */
/**
 * Result of `buildWebSocketProxy`. We deliberately type `Constructor`
 * as a generic construct signature rather than `typeof WebSocket`:
 * the proxy implements the runtime surface plugin code uses, but
 * doesn't replicate every static of the browser global. `swapInProxy`
 * accepts `unknown` so the typing here only needs to be useful at the
 * call site.
 */
export interface WebSocketProxyInstall {
  readonly Constructor: new (url: string | URL, protocols?: string | string[]) => unknown;
  readonly detach: () => void;
}

/**
 * Build the WebSocket constructor and the per-channel stream-event
 * dispatcher. The dispatcher is registered once per Channel; every
 * proxy instance routes events through it by handleId.
 */
export function buildWebSocketProxy(deps: WebSocketProxyDeps): WebSocketProxyInstall {
  const proxiesByHandle = new Map<string, WebSocketProxy>();

  const listener = (event: StreamEventType): void => {
    const ws = proxiesByHandle.get(event.handleId);
    if (!ws) {
      return;
    }
    ws._onStreamEvent(event);
  };

  const unsubscribe = deps.channel.on(streamEvent, listener);

  class WebSocketProxy {
    static readonly CONNECTING = WS_CONNECTING;
    static readonly OPEN = WS_OPEN;
    static readonly CLOSING = WS_CLOSING;
    static readonly CLOSED = WS_CLOSED;

    readonly CONNECTING = WS_CONNECTING;
    readonly OPEN = WS_OPEN;
    readonly CLOSING = WS_CLOSING;
    readonly CLOSED = WS_CLOSED;

    readonly url: string;
    binaryType: 'blob' | 'arraybuffer' = 'arraybuffer';
    readyState: 0 | 1 | 2 | 3 = WS_CONNECTING;

    #handleId: string | null = null;
    #pendingSends: Array<string | Uint8Array> = [];
    readonly #listeners: Map<string, Set<EventHandler>> = new Map();
    #onopen: EventHandler | null = null;
    #onmessage: EventHandler | null = null;
    #onclose: EventHandler | null = null;
    #onerror: EventHandler | null = null;

    constructor(url: string | URL, protocols?: string | string[]) {
      this.url = typeof url === 'string' ? url : url.toString();
      // The constructor itself is sync — `kickOffConnect` schedules
      // the connect work on a microtask so the constructor returns
      // before any IPC actually fires. Browsers do the same: the
      // open event is always asynchronous relative to construction.
      kickOffConnect(this, protocols);
    }

    /** @internal — invoked indirectly by `kickOffConnect`. */
    async _runConnect(protocols?: string | string[]): Promise<void> {
      try {
        await this.#init(protocols);
      } catch (e) {
        this.readyState = WS_CLOSED;
        const msg = e instanceof Error ? e.message : String(e);
        this.#emit('error', { type: 'error', message: msg });
      }
    }

    async #init(protocols?: string | string[]): Promise<void> {
      const protoList = normaliseProtocols(protocols);
      const raw = await deps.channel.call(grantRequest, {
        id: 'dev.brika.ws.connect',
        args: { url: this.url, protocols: protoList },
      });
      const parsed = WsConnectResultSchema.parse(raw.result);
      this.#handleId = parsed.handleId;
      proxiesByHandle.set(parsed.handleId, this);
      // Drain anything the caller queued before connect resolved.
      for (const frame of this.#pendingSends) {
        await this.#dispatchSend(frame);
      }
      this.#pendingSends = [];
    }

    send(data: string | Uint8Array): void {
      if (this.readyState >= WS_CLOSING) {
        throw new Error('InvalidStateError: WebSocket is closed');
      }
      if (this.#handleId === null) {
        // Connect hasn't resolved yet — buffer and replay.
        this.#pendingSends.push(data);
        return;
      }
      this.#dispatchSend(data).catch(() => {
        // Send failures surface through the channel's own error
        // emission; nothing to do here.
      });
    }

    async #dispatchSend(data: string | Uint8Array): Promise<void> {
      if (this.#handleId === null) {
        return;
      }
      const raw = await deps.channel.call(grantRequest, {
        id: 'dev.brika.ws.send',
        args: { handleId: this.#handleId, data },
      });
      WsSendResultSchema.parse(raw.result);
    }

    close(code?: number, reason?: string): void {
      this.readyState = WS_CLOSING;
      if (this.#handleId === null) {
        // Hadn't opened yet — just mark closed and emit.
        this.readyState = WS_CLOSED;
        this.#emit('close', { type: 'close', code: code ?? 1000, reason: reason ?? '' });
        return;
      }
      const id = this.#handleId;
      deps.channel
        .call(grantRequest, { id: 'dev.brika.ws.close', args: { handleId: id, code, reason } })
        .then((r) => WsCloseResultSchema.parse(r.result))
        .catch(() => {
          // Close is best-effort: if the hub-side handle already
          // dropped (peer closed, plugin shutting down, …) the call
          // rejects. The local readyState is already CLOSING; we
          // don't surface this to the plugin.
        });
    }

    /** @internal — called by the proxy dispatcher; not a public API. */
    _onStreamEvent(event: StreamEventType): void {
      switch (event.kind) {
        case 'open':
          this.readyState = WS_OPEN;
          this.#emit('open', { type: 'open' });
          break;
        case 'message':
          this.#emit('message', { type: 'message', data: event.data });
          break;
        case 'close':
          this.readyState = WS_CLOSED;
          if (this.#handleId !== null) {
            proxiesByHandle.delete(this.#handleId);
          }
          this.#emit('close', { type: 'close', code: event.code, reason: event.reason });
          break;
        case 'error':
          this.#emit('error', { type: 'error', message: event.message });
          break;
      }
    }

    addEventListener(type: string, handler: EventHandler): void {
      let set = this.#listeners.get(type);
      if (!set) {
        set = new Set();
        this.#listeners.set(type, set);
      }
      set.add(handler);
    }

    removeEventListener(type: string, handler: EventHandler): void {
      this.#listeners.get(type)?.delete(handler);
    }

    set onopen(h: EventHandler | null) {
      this.#onopen = h;
    }
    set onmessage(h: EventHandler | null) {
      this.#onmessage = h;
    }
    set onclose(h: EventHandler | null) {
      this.#onclose = h;
    }
    set onerror(h: EventHandler | null) {
      this.#onerror = h;
    }
    get onopen(): EventHandler | null {
      return this.#onopen;
    }
    get onmessage(): EventHandler | null {
      return this.#onmessage;
    }
    get onclose(): EventHandler | null {
      return this.#onclose;
    }
    get onerror(): EventHandler | null {
      return this.#onerror;
    }

    #emit(type: string, event: unknown): void {
      const onProp = this.#namedHandler(type);
      if (onProp) {
        try {
          onProp(event);
        } catch {
          // Browsers swallow handler errors; mirror that to avoid
          // crashing the plugin process.
        }
      }
      const listeners = this.#listeners.get(type);
      if (!listeners) {
        return;
      }
      for (const handler of listeners) {
        try {
          handler(event);
        } catch {
          // Same rationale.
        }
      }
    }

    #namedHandler(type: string): EventHandler | null {
      switch (type) {
        case 'open':
          return this.#onopen;
        case 'message':
          return this.#onmessage;
        case 'close':
          return this.#onclose;
        case 'error':
          return this.#onerror;
        default:
          return null;
      }
    }
  }

  return {
    Constructor: WebSocketProxy,
    detach: unsubscribe,
  };
}

// ─── Module-scope helpers (kept outside the class so the constructor
//     stays sync-only — sonar S7059 rejects async patterns there) ────

function normaliseProtocols(protocols?: string | string[]): string[] | undefined {
  if (protocols === undefined) {
    return undefined;
  }
  if (Array.isArray(protocols)) {
    return protocols;
  }
  return [protocols];
}

interface WebSocketProxyLike {
  _runConnect(protocols?: string | string[]): Promise<void>;
}

/**
 * Schedule the async connect work on a microtask. Removing the
 * fire-and-forget out of the constructor is what satisfies the
 * "no async from constructor" lint while preserving the synchronous
 * `new WebSocket(url)` API contract.
 */
function kickOffConnect(proxy: WebSocketProxyLike, protocols?: string | string[]): void {
  queueMicrotask(() => {
    proxy._runConnect(protocols).catch(() => {
      // `_runConnect` already routes failures through `_onStreamEvent`
      // (error kind). The catch here exists only so unhandled-promise
      // rejection telemetry stays quiet — there's no recovery to do.
    });
  });
}
