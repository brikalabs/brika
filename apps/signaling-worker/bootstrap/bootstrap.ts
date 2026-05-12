/**
 * Brika bootstrap shell.
 *
 * Lives at every URL the Worker serves and replaces the old "ship UI bundle
 * in the Worker" model. The Worker stays at a fixed protocol version; the
 * actual app code is fetched from the hub via the same WebRTC data channel
 * the running app uses. That way the UI a browser sees is always the version
 * the hub is running — no more "newer Worker, older hub, broken app".
 *
 * Flow:
 *   1. Read hub name (worker stamps it into <meta name="brika:hub">).
 *   2. POST /v1/tickets → short-lived signed ticket.
 *   3. Open signaling WS `/v1/client?hub=&ticket=` + WebRTC handshake.
 *   4. Wait for the data channel to open.
 *   5. RPC-fetch `/__brika/manifest.json` from the hub. (Falls back to
 *      walking `/index.html` if the hub doesn't expose a manifest yet.)
 *   6. Pre-fetch every JS chunk + CSS file the manifest names, through
 *      the data channel; create Blob URLs.
 *   7. Inject an import map that points every `/assets/<chunk>` URL at
 *      the matching Blob URL, plus the CSS <link> tags.
 *   8. Inject the entry `<script type="module">` — browser ES loader
 *      resolves every import through the map; nothing hits the network.
 *
 * If anything fails before step 7 we surface a clear "couldn't reach this
 * hub" screen so the user knows what happened. After step 7 the loaded app
 * owns the page; this file is no longer involved.
 */

import {
  decodeRpc,
  decodeSignaling,
  encodeRpc,
  encodeSignaling,
  type IceCandidate,
  PROTOCOL_VERSION,
  type RpcMessage,
  type SignalingMessage,
} from '@brika/remote-access-protocol';

// ─── Dev affordances ───────────────────────────────────────────────────────

/**
 * `?debug=1` (or `localStorage.brikaBootstrapDebug = '1'`) prints every step
 * of the bootstrap to the console — useful when iterating on the loader or
 * when the splash hangs and you want to know which RPC frame got lost.
 */
const DEBUG = (() => {
  if (typeof location === 'undefined') return false;
  if (new URLSearchParams(location.search).get('debug') === '1') return true;
  try {
    return localStorage.getItem('brikaBootstrapDebug') === '1';
  } catch {
    return false;
  }
})();

function dlog(...args: unknown[]): void {
  if (DEBUG) console.log('[brika.bootstrap]', ...args);
}

// ─── Status surface ────────────────────────────────────────────────────────

type Phase = 'landing' | 'connecting' | 'fetching' | 'loading' | 'error' | 'done';

type ErrorAction =
  | { kind: 'retry'; onRetry: () => void; secondaryHref?: string }
  | { kind: 'change-name' }
  | { kind: 'help'; href: string };

interface ErrorView {
  title: string;
  detail: string;
  action: ErrorAction;
  /** Seconds before an auto-retry fires; omit to disable. */
  autoRetryAfter?: number;
}

interface StatusSurface {
  setPhase(phase: Phase, message?: string): void;
  showError(view: ErrorView): void;
}

function createStatusSurface(): StatusSurface {
  const root = document.querySelector<HTMLElement>('#brika-bootstrap');
  if (!root) {
    return { setPhase: () => {}, showError: () => {} };
  }
  const statusEl = root.querySelector<HTMLElement>('[data-brika-status]');
  const errorTitle = root.querySelector<HTMLElement>('[data-brika-error-title]');
  const errorDetail = root.querySelector<HTMLElement>('[data-brika-error-detail]');
  const errorPrimary = root.querySelector<HTMLButtonElement>('[data-brika-error-primary]');
  const errorSecondary = root.querySelector<HTMLAnchorElement>('[data-brika-error-secondary]');
  const errorRetry = root.querySelector<HTMLElement>('[data-brika-error-retry]');

  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  const stopCountdown = (): void => {
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (errorRetry) {
      errorRetry.dataset.active = '';
      errorRetry.textContent = '';
    }
  };

  return {
    setPhase(phase, message) {
      root.dataset.brikaPhase = phase;
      if (phase !== 'error') {
        stopCountdown();
      }
      if (statusEl && message) {
        statusEl.textContent = message;
      }
    },
    showError(view) {
      stopCountdown();
      root.dataset.brikaPhase = 'error';
      if (errorTitle) errorTitle.textContent = view.title;
      if (errorDetail) errorDetail.textContent = view.detail;

      if (errorPrimary) {
        const PRIMARY_LABELS: Record<ErrorAction['kind'], string> = {
          retry: 'Try again',
          'change-name': 'Different hub',
          help: 'Get help',
        };
        errorPrimary.textContent = PRIMARY_LABELS[view.action.kind];
        errorPrimary.onclick = (): void => {
          if (view.action.kind === 'retry') {
            stopCountdown();
            view.action.onRetry();
          } else if (view.action.kind === 'change-name') {
            location.href = '/';
          } else {
            window.open(view.action.href, '_blank', 'noopener');
          }
        };
      }
      if (errorSecondary) {
        if (view.action.kind === 'retry') {
          errorSecondary.textContent = 'Different hub';
          errorSecondary.href = '/';
          errorSecondary.style.display = '';
        } else {
          errorSecondary.style.display = 'none';
        }
      }
      if (
        view.action.kind === 'retry' &&
        typeof view.autoRetryAfter === 'number' &&
        view.autoRetryAfter > 0 &&
        errorRetry
      ) {
        let remaining = view.autoRetryAfter;
        const action = view.action;
        const render = (): void => {
          errorRetry.dataset.active = '1';
          errorRetry.textContent = `Auto-retrying in ${remaining}s…`;
        };
        render();
        countdownTimer = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            stopCountdown();
            action.onRetry();
            return;
          }
          render();
        }, 1000);
      }
    },
  };
}

// ─── Error classification ─────────────────────────────────────────────────

interface ErrorClassification {
  title: string;
  detail: string;
  /** 'retry' for transient failures, 'change-name' for unknown hubs, 'help' for setup issues. */
  kind: 'retry' | 'change-name' | 'help';
  /** Whether to auto-retry (in seconds). Only meaningful for `kind === 'retry'`. */
  autoRetry?: number;
}

function classifyError(err: unknown, hubName: string): ErrorClassification {
  const message = err instanceof Error ? err.message : String(err);
  // 404 from /v1/tickets — the name was never claimed.
  if (/Unknown hub|404/.test(message)) {
    return {
      title: `No hub named "${hubName}"`,
      detail:
        "That name isn't registered on this coordinator. Double-check the URL — names are case-insensitive but must match exactly.",
      kind: 'change-name',
    };
  }
  // Hub never opened its UI handler — older version, no remote-access support.
  if (/missing a module entry|outdated hub/i.test(message)) {
    return {
      title: 'Your hub needs an update',
      detail: `"${hubName}" is running an older version of Brika that doesn't serve its UI through the bridge yet. Update the hub and reload this page.`,
      kind: 'help',
    };
  }
  // WS-level failures are usually the coordinator side.
  if (/Signaling WS|open timed out|errored before open/.test(message)) {
    return {
      title: "Can't reach the signaling service",
      detail:
        "The Brika coordinator might be temporarily down. This usually clears up on its own — we'll retry automatically.",
      kind: 'retry',
      autoRetry: 30,
    };
  }
  // Data-channel + WebRTC failures = the hub itself is offline.
  if (/Data channel|WebRTC connection (failed|closed)/.test(message)) {
    return {
      title: 'Your hub looks offline',
      detail: `"${hubName}" isn't reachable right now. Make sure the device is powered on and connected to the internet, then try again.`,
      kind: 'retry',
      autoRetry: 30,
    };
  }
  // Generic network/fetch failure — coordinator HTTP didn't even respond.
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return {
      title: 'Network error',
      detail:
        "Couldn't reach the Brika coordinator at all. Check your internet connection and try again.",
      kind: 'retry',
      autoRetry: 15,
    };
  }
  return {
    title: `Couldn't reach "${hubName}"`,
    detail: message,
    kind: 'retry',
    autoRetry: 30,
  };
}

// ─── Read hub identity ─────────────────────────────────────────────────────

/**
 * Hub-name shape. Must mirror `validateName` in `@brika/remote-access-protocol`
 * — the coordinator rejects anything else, so accepting it here would only
 * lead to a confusing 4xx later. Used as the security boundary for every
 * URL we construct from a hub name (Sonar S8476, S8480).
 */
const HUB_NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;

function isValidHubName(candidate: string | null | undefined): candidate is string {
  return Boolean(candidate && HUB_NAME_PATTERN.test(candidate));
}

function readHubName(): string | null {
  // 1. Worker-injected meta tag (preferred). Still re-validated even though
  //    the worker has its own validator — defence in depth.
  const meta = document.querySelector('meta[name="brika:hub"]')?.getAttribute('content');
  if (isValidHubName(meta)) return meta;
  // 2. Path fallback for self-hosted setups.
  const first = location.pathname.split('/').find((s) => s.length > 0);
  if (isValidHubName(first)) return first;
  return null;
}

// ─── Coordinator HTTP helpers ──────────────────────────────────────────────

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface TicketResponse {
  ticket: string;
  expiresAt: number;
  iceServers?: IceServer[];
}

/**
 * Resolve the coordinator origin. Defaults to the page's origin (production:
 * `hub.brika.dev` serves both the bootstrap AND the API). A `?coordinator=`
 * override lets you point the bootstrap at a locally-running wrangler dev
 * coordinator without rebuilding — useful when iterating on the worker code.
 */
function resolveCoordinator(): string {
  const override = new URLSearchParams(location.search).get('coordinator');
  if (override) {
    try {
      return new URL(override).origin;
    } catch {
      // fall through to default
    }
  }
  return location.origin;
}

async function mintTicket(hubName: string, coordinator: string): Promise<TicketResponse> {
  // Re-validate at the boundary so the taint analysis can see the guard,
  // and so a bug in upstream callers can't slip a malformed name through.
  if (!isValidHubName(hubName)) {
    throw new Error(`Refusing to mint ticket for invalid hub name "${hubName}"`);
  }
  dlog('mintTicket', { hubName, coordinator });
  const res = await fetch(`${coordinator}/v1/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hubName }),
  });
  if (!res.ok) {
    throw new Error(`/v1/tickets failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TicketResponse;
}

// ─── WebRTC + signaling ────────────────────────────────────────────────────

const FALLBACK_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

interface PeerHandle {
  send(frame: RpcMessage): void;
  request(method: string, url: string, signal?: AbortSignal): Promise<Response>;
  close(): void;
}

interface InflightEntry {
  controller: AbortController;
  resolve: (res: Response) => void;
  reject: (err: Error) => void;
  headEmitted: boolean;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  stream: ReadableStream<Uint8Array>;
}

function chunkToBytes(msg: { dataB64?: string; dataText?: string }): Uint8Array {
  if (msg.dataB64) {
    return Uint8Array.from(atob(msg.dataB64), (c) => c.codePointAt(0) ?? 0);
  }
  return new TextEncoder().encode(msg.dataText ?? '');
}

function deliverHead(
  entry: InflightEntry,
  status: number,
  headers: ReadonlyArray<readonly [string, string]>
): void {
  entry.headEmitted = true;
  const response = new Response(entry.stream, { status, headers: new Headers(headers) });
  entry.resolve(response);
}

function dispatchRpcFrame(msg: RpcMessage, inflight: Map<number, InflightEntry>): void {
  if (
    msg.kind !== 'response.head' &&
    msg.kind !== 'response.chunk' &&
    msg.kind !== 'response.end' &&
    msg.kind !== 'response.error'
  ) {
    return;
  }
  const entry = inflight.get(msg.id);
  if (!entry) return;
  switch (msg.kind) {
    case 'response.head':
      deliverHead(entry, msg.status, msg.headers);
      return;
    case 'response.chunk':
      void entry.writer.write(chunkToBytes(msg));
      return;
    case 'response.end':
      void entry.writer.close();
      inflight.delete(msg.id);
      return;
    case 'response.error':
      if (entry.headEmitted) {
        void entry.writer.abort(new Error(`RPC ${msg.id}: ${msg.code}`));
      } else {
        entry.reject(new Error(`RPC ${msg.id}: ${msg.code} ${msg.message ?? ''}`));
      }
      inflight.delete(msg.id);
      return;
  }
}

function closeSilently(closable: { close(): void }): void {
  try {
    closable.close();
  } catch {
    /* peer already torn down */
  }
}

function buildSignalingUrl(coordinator: string, hubName: string, ticket: string): string {
  // Boundary check so Sonar's taint analyzer sees the guard at the use site.
  if (!isValidHubName(hubName)) {
    throw new Error(`Refusing to open signaling URL for invalid hub name "${hubName}"`);
  }
  const u = new URL('/v1/client', coordinator);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.searchParams.set('hub', hubName);
  u.searchParams.set('ticket', ticket);
  return u.toString();
}

function pickIceServers(servers: ReadonlyArray<IceServer> | undefined): RTCIceServer[] {
  const chosen = servers && servers.length > 0 ? servers : FALLBACK_ICE_SERVERS;
  return chosen.map(
    (s): RTCIceServer => ({
      urls: s.urls,
      username: s.username,
      credential: s.credential,
    })
  );
}

function waitForOpen(ws: WebSocket, timeoutMs: number, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} open timed out`)), timeoutMs);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error(`${label} errored before open`));
      },
      { once: true }
    );
  });
}

function waitForDataChannel(channel: RTCDataChannel, pc: RTCPeerConnection): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Data channel open timed out')), 30_000);
    if (channel.readyState === 'open') {
      clearTimeout(timeout);
      resolve();
      return;
    }
    channel.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        clearTimeout(timeout);
        reject(new Error(`WebRTC connection ${pc.connectionState}`));
      }
    });
  });
}

interface SignalingCtx {
  readonly pc: RTCPeerConnection;
  readonly pendingIce: IceCandidate[];
  readonly sessionRef: { current: string };
  send(msg: SignalingMessage): void;
}

async function handleSignalingFrame(raw: string, ctx: SignalingCtx): Promise<void> {
  const msg = decodeSignaling(raw);
  if (!msg) return;
  if (msg.kind === 'session.iceServers') {
    // RTCPeerConnection doesn't hot-swap iceServers post-creation, so this
    // is informational.
    return;
  }
  if (msg.kind === 'session.answer') {
    ctx.sessionRef.current = msg.sessionId;
    await ctx.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    for (const cand of ctx.pendingIce) {
      ctx.send({
        v: PROTOCOL_VERSION,
        kind: 'client.ice',
        sessionId: ctx.sessionRef.current,
        candidate: cand,
      });
    }
    ctx.pendingIce.length = 0;
    return;
  }
  if (msg.kind === 'session.ice') {
    try {
      await ctx.pc.addIceCandidate({
        candidate: msg.candidate.candidate,
        sdpMid: msg.candidate.sdpMid,
        sdpMLineIndex: msg.candidate.sdpMLineIndex,
      });
    } catch {
      // Late/malformed candidates are harmless to drop.
    }
    return;
  }
  if (msg.kind === 'session.error') {
    throw new Error(`Signaling error: ${msg.code} ${msg.message ?? ''}`);
  }
}

async function openPeer(
  hubName: string,
  ticket: TicketResponse,
  coordinator: string,
  status: StatusSurface
): Promise<PeerHandle> {
  status.setPhase('connecting', `Connecting to ${hubName}…`);
  dlog('openPeer', { hubName, coordinator });

  const ws = new WebSocket(buildSignalingUrl(coordinator, hubName, ticket.ticket), [
    `brika.v${PROTOCOL_VERSION}`,
    `ticket.${ticket.ticket}`,
  ]);
  const pc = new RTCPeerConnection({ iceServers: pickIceServers(ticket.iceServers) });

  const sessionRef = { current: '' };
  const pendingIce: IceCandidate[] = [];

  const sendSignaling = (msg: SignalingMessage): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encodeSignaling(msg));
    }
  };

  pc.addEventListener('icecandidate', (ev) => {
    if (!ev.candidate) return;
    const cand: IceCandidate = {
      candidate: ev.candidate.candidate,
      sdpMid: ev.candidate.sdpMid ?? undefined,
      sdpMLineIndex: ev.candidate.sdpMLineIndex ?? undefined,
    };
    if (sessionRef.current) {
      sendSignaling({
        v: PROTOCOL_VERSION,
        kind: 'client.ice',
        sessionId: sessionRef.current,
        candidate: cand,
      });
    } else {
      pendingIce.push(cand);
    }
  });

  // We create the data channel locally so SDP negotiation knows about it.
  const channel = pc.createDataChannel('rpc', { ordered: true });
  channel.binaryType = 'arraybuffer';

  const inflight = new Map<number, InflightEntry>();
  let nextId = 1;
  let dataChannel: RTCDataChannel | null = null;

  const sendRpc = (frame: RpcMessage): void => {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(encodeRpc(frame));
    }
  };

  channel.addEventListener('open', () => {
    dataChannel = channel;
    dlog('data channel open');
    sendRpc({
      v: PROTOCOL_VERSION,
      kind: 'hello',
      role: 'client',
      softwareVersion: 'bootstrap',
      maxProtocolVersion: PROTOCOL_VERSION,
    });
  });

  channel.addEventListener('message', (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
    const msg = decodeRpc(raw);
    if (msg) dispatchRpcFrame(msg, inflight);
  });

  const handle: PeerHandle = {
    send: sendRpc,
    request: (method, url, signal) =>
      makeRpcRequest(method, url, signal, inflight, () => nextId++, sendRpc),
    close: () => {
      closeSilently(channel);
      closeSilently(pc);
      closeSilently(ws);
    },
  };

  await waitForOpen(ws, 10_000, 'Signaling WS');

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  if (!offer.sdp) throw new Error('createOffer produced no SDP');
  sendSignaling({
    v: PROTOCOL_VERSION,
    kind: 'client.offer',
    hubName,
    sdp: offer.sdp,
    ticket: ticket.ticket,
    caps: ['rpc.v1'],
  });

  const ctx: SignalingCtx = { pc, pendingIce, sessionRef, send: sendSignaling };
  ws.addEventListener('message', (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
    void handleSignalingFrame(raw, ctx);
  });

  await waitForDataChannel(channel, pc);
  return handle;
}

function makeRpcRequest(
  method: string,
  url: string,
  signal: AbortSignal | undefined,
  inflight: Map<number, InflightEntry>,
  nextId: () => number,
  sendRpc: (frame: RpcMessage) => void
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const id = nextId();
    const { writable, readable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }
    controller.signal.addEventListener('abort', () => {
      sendRpc({ v: PROTOCOL_VERSION, kind: 'abort', id });
      inflight.delete(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
    inflight.set(id, {
      controller,
      resolve,
      reject,
      headEmitted: false,
      writer,
      stream: readable,
    });
    sendRpc({
      v: PROTOCOL_VERSION,
      kind: 'request',
      id,
      method,
      url,
      // Bootstrap only ever issues GETs for asset fetches — no body.
      headers: [],
    });
  });
}

// ─── Service Worker + Cache API ────────────────────────────────────────────

const ASSET_CACHE = 'brika-assets-v1';

/**
 * Register the asset-cache Service Worker and wait until it controls this
 * page. After that point every `<script src=/assets/…>` / `<link href=…>` /
 * CSS `url(/assets/…)` / dynamic `import('/assets/…')` is intercepted and
 * served from the cache the bootstrap is about to prime.
 *
 * Returns `false` if SW isn't available (private mode, ancient browser) so
 * the caller can fall back to the Blob-URL + import-map path.
 */
async function ensureServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    dlog('SW not available — falling back to Blob URLs');
    return false;
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (navigator.serviceWorker.controller) {
      // SW from a previous visit is already in charge.
      dlog('SW already controlling page');
      return true;
    }
    // First registration — wait for the SW to activate and claim() this client.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SW activation timed out')), 5_000);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
    dlog('SW newly active');
    return true;
  } catch (err) {
    dlog('SW register failed', err);
    return false;
  }
}

// ─── Asset graph ───────────────────────────────────────────────────────────

interface AssetGraph {
  /** Original entry script URL (e.g. `/assets/index-abc.js`). */
  entryUrl: string;
  /** CSS hrefs in document order. */
  cssUrls: string[];
  /** Original title from the hub's index.html. */
  title: string;
  /**
   * Optional: when SW isn't available we fall back to Blob URLs and build
   * an import map. Populated only on the no-SW path.
   */
  blobs?: Map<string, string>;
}

const ASSET_RE = /\/assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|json)/g;

/**
 * Best-effort MIME guess for the bootstrap-side fetch. Hub responses also
 * carry their own `content-type`; this is a fallback for binary asset types
 * where the protocol's text/base64 distinction loses the original header.
 */
function guessAssetMime(url: string): string | undefined {
  if (url.endsWith('.css')) return 'text/css';
  if (url.endsWith('.js')) return 'text/javascript';
  return undefined;
}

interface FetchedAsset {
  bytes: ArrayBuffer;
  text: string | null;
  contentType: string;
}

async function fetchAssetThroughPeer(
  peer: PeerHandle,
  url: string,
  mime: string | undefined
): Promise<FetchedAsset> {
  const res = await peer.request('GET', url);
  if (!res.ok) throw new Error(`Hub ${url} → ${res.status}`);
  const bytes = await res.arrayBuffer();
  const contentType = mime ?? res.headers.get('content-type') ?? 'application/octet-stream';
  const isText = /\b(javascript|json|css|text)\b/i.test(contentType);
  const text = isText ? new TextDecoder().decode(bytes) : null;
  return { bytes, text, contentType };
}

/**
 * Prime the cache the SW will serve from. For each URL in the graph: check
 * the cache first, fall back to the hub via WebRTC on miss, then `put` the
 * fresh response so subsequent visits don't pay the cost.
 */
async function fetchOrCache(cache: Cache, peer: PeerHandle, url: string): Promise<string | null> {
  const cached = await cache.match(url);
  if (cached) {
    return url.endsWith('.js') ? await cached.clone().text() : null;
  }
  const { bytes, text, contentType } = await fetchAssetThroughPeer(peer, url, guessAssetMime(url));
  const response = new Response(bytes, { headers: { 'content-type': contentType } });
  // `cache.put` swallows quota errors — if the user's disk is full, we
  // still want to serve from memory this session.
  cache.put(url, response).catch((err) => dlog('cache.put failed', url, err));
  return text;
}

function scanForChunkRefs(
  text: string | null,
  url: string,
  queue: string[],
  visited: Set<string>
): void {
  if (!text || !url.endsWith('.js')) {
    return;
  }
  for (const match of text.matchAll(ASSET_RE)) {
    if (!visited.has(match[0])) queue.push(match[0]);
  }
}

async function primeAssetCache(
  peer: PeerHandle,
  initial: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  const cache = await caches.open(ASSET_CACHE);
  const visited = new Set<string>();
  const queue: string[] = [...initial];

  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const text = await fetchOrCache(cache, peer, url);
    scanForChunkRefs(text, url, queue, visited);
  }

  return [...visited];
}

async function fetchAsBlobUrl(
  peer: PeerHandle,
  url: string,
  mime: string | undefined
): Promise<{ blobUrl: string; text: string | null }> {
  const { bytes, text, contentType } = await fetchAssetThroughPeer(peer, url, mime);
  const blob = new Blob([bytes], { type: contentType });
  return { blobUrl: URL.createObjectURL(blob), text };
}

/**
 * Fallback for browsers without Service Worker support: build Blob URLs and
 * an import map. Same outcome (no network for assets) at the cost of more
 * code and no cross-load cache.
 */
async function buildBlobGraph(
  peer: PeerHandle,
  initial: ReadonlyArray<string>
): Promise<Map<string, string>> {
  const blobs = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [...initial];
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const mime = guessAssetMime(url);
    const { blobUrl, text } = await fetchAsBlobUrl(peer, url, mime);
    blobs.set(url, blobUrl);
    if (text && url.endsWith('.js')) {
      for (const match of text.matchAll(ASSET_RE)) {
        if (!visited.has(match[0])) queue.push(match[0]);
      }
    }
  }
  return blobs;
}

async function buildAssetGraph(
  peer: PeerHandle,
  status: StatusSurface,
  hasServiceWorker: boolean
): Promise<AssetGraph> {
  status.setPhase('fetching', 'Loading app from your hub…');
  dlog('fetching /index.html');

  const indexRes = await peer.request('GET', '/');
  if (!indexRes.ok) throw new Error(`Hub /index.html → ${indexRes.status}`);
  const html = await indexRes.text();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const entryScript = doc.querySelector('script[type="module"][src^="/assets/"]');
  const entryUrl = entryScript?.getAttribute('src');
  if (!entryUrl) throw new Error('Hub UI is missing a module entry — outdated hub?');
  const cssUrls = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]')).map(
    (el) => el.getAttribute('href') as string
  );
  const title = doc.title;

  if (hasServiceWorker) {
    const primed = await primeAssetCache(peer, [entryUrl, ...cssUrls]);
    dlog('asset cache primed', { chunks: primed.length, cssUrls });
    return { entryUrl, cssUrls, title };
  }

  const blobs = await buildBlobGraph(peer, [entryUrl, ...cssUrls]);
  dlog('blob graph built (no SW)', { chunks: blobs.size, cssUrls });
  return { entryUrl, cssUrls, title, blobs };
}

function injectGraph(graph: AssetGraph): void {
  if (graph.title) document.title = graph.title;

  if (graph.blobs) {
    // Fallback path: ES import map + Blob URLs.
    const imports: Record<string, string> = {};
    for (const [original, blob] of graph.blobs) {
      if (original.endsWith('.js')) imports[original] = blob;
    }
    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({ imports });
    document.head.appendChild(importMap);

    for (const css of graph.cssUrls) {
      const blob = graph.blobs.get(css);
      if (!blob) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = blob;
      document.head.appendChild(link);
    }

    document.querySelector('#brika-bootstrap')?.remove();

    const entry = document.createElement('script');
    entry.type = 'module';
    entry.src = graph.blobs.get(graph.entryUrl) ?? graph.entryUrl;
    document.body.appendChild(entry);
    return;
  }

  // SW path: inject the ORIGINAL URLs. The browser will fetch them, the SW
  // intercepts, and the priming cache serves the response instantly.
  for (const css of graph.cssUrls) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = css;
    document.head.appendChild(link);
  }

  document.querySelector('#brika-bootstrap')?.remove();

  const entry = document.createElement('script');
  entry.type = 'module';
  entry.src = graph.entryUrl;
  document.body.appendChild(entry);
}

// ─── Landing (hub.brika.dev with no name) ─────────────────────────────────

/**
 * Switch the splash into "landing" mode: shows the wordmark, tagline, and a
 * little input that takes a hub name and navigates to `/<name>`. Used when
 * the URL doesn't identify any hub — far better UX than the previous
 * "No hub specified" error.
 */
function showLanding(status: StatusSurface): void {
  status.setPhase('landing');
  const form = document.querySelector<HTMLFormElement>('[data-brika-form]');
  const input = document.querySelector<HTMLInputElement>('[data-brika-input]');
  const error = document.querySelector<HTMLElement>('[data-brika-form-error]');
  const submit = document.querySelector<HTMLButtonElement>('[data-brika-submit]');
  if (!form || !input || !error || !submit) {
    return;
  }
  submit.disabled = true;
  input.addEventListener('input', () => {
    submit.disabled = input.value.trim().length < 4;
    if (error.textContent) error.textContent = '';
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const candidate = input.value.trim().toLowerCase();
    if (!isValidHubName(candidate)) {
      error.textContent =
        'Names are 4–32 chars: lowercase letters, digits, hyphens. Must start with a letter and end alphanumeric.';
      return;
    }
    // Navigate so the worker stamps the meta tag and we go through the
    // normal bootstrap path on the next page load.
    location.href = `/${candidate}`;
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function attemptConnect(hubName: string, status: StatusSurface): Promise<void> {
  status.setPhase('connecting', `Connecting to ${hubName}…`);
  const coordinator = resolveCoordinator();
  dlog('attemptConnect', { hubName, coordinator, debug: DEBUG });
  // SW registration + ticket mint run in parallel — independent prerequisites.
  const swPromise = ensureServiceWorker();
  let peer: PeerHandle | null = null;
  try {
    const ticket = await mintTicket(hubName, coordinator);
    peer = await openPeer(hubName, ticket, coordinator, status);
    const hasServiceWorker = await swPromise;
    const graph = await buildAssetGraph(peer, status, hasServiceWorker);
    status.setPhase('loading', 'Starting app…');
    injectGraph(graph);
    status.setPhase('done');
  } catch (err) {
    if (peer) peer.close();
    dlog('attemptConnect failed', err);
    const classification = classifyError(err, hubName);
    const retry = (): void => {
      void attemptConnect(hubName, status);
    };
    if (classification.kind === 'retry') {
      status.showError({
        title: classification.title,
        detail: classification.detail,
        action: { kind: 'retry', onRetry: retry },
        autoRetryAfter: classification.autoRetry,
      });
    } else if (classification.kind === 'change-name') {
      status.showError({
        title: classification.title,
        detail: classification.detail,
        action: { kind: 'change-name' },
      });
    } else {
      status.showError({
        title: classification.title,
        detail: classification.detail,
        action: { kind: 'help', href: 'https://brika.dev/docs/remote-access' },
      });
    }
  }
}

async function main(): Promise<void> {
  const status = createStatusSurface();
  const hubName = readHubName();
  if (!hubName) {
    showLanding(status);
    return;
  }
  await attemptConnect(hubName, status);
}

await main();
