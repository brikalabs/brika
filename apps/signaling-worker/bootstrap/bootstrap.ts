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

type Phase = 'connecting' | 'fetching' | 'loading' | 'error' | 'done';

interface StatusSurface {
  setPhase(phase: Phase, message?: string): void;
  showError(title: string, detail?: string): void;
}

function createStatusSurface(): StatusSurface {
  const root = document.querySelector<HTMLElement>('#brika-bootstrap');
  if (!root) {
    return { setPhase: () => {}, showError: () => {} };
  }
  const statusEl = root.querySelector<HTMLElement>('[data-brika-status]');
  const detailEl = root.querySelector<HTMLElement>('[data-brika-detail]');
  return {
    setPhase(phase, message) {
      root.dataset.brikaPhase = phase;
      if (statusEl && message) {
        statusEl.textContent = message;
      }
    },
    showError(title, detail) {
      root.dataset.brikaPhase = 'error';
      if (statusEl) statusEl.textContent = title;
      if (detailEl && detail) detailEl.textContent = detail;
    },
  };
}

// ─── Read hub identity ─────────────────────────────────────────────────────

function readHubName(): string | null {
  // 1. Worker-injected meta tag (preferred).
  const meta = document.querySelector('meta[name="brika:hub"]')?.getAttribute('content');
  if (meta) return meta;
  // 2. Path fallback for self-hosted setups.
  const first = location.pathname.split('/').find((s) => s.length > 0);
  if (first && /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/.test(first)) return first;
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

async function openPeer(
  hubName: string,
  ticket: TicketResponse,
  coordinator: string,
  status: StatusSurface
): Promise<PeerHandle> {
  status.setPhase('connecting', `Connecting to ${hubName}…`);
  dlog('openPeer', { hubName, coordinator });

  const wsUrl = (() => {
    const u = new URL('/v1/client', coordinator);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('hub', hubName);
    u.searchParams.set('ticket', ticket.ticket);
    return u.toString();
  })();

  const ws = new WebSocket(wsUrl, [`brika.v${PROTOCOL_VERSION}`, `ticket.${ticket.ticket}`]);
  const pc = new RTCPeerConnection({
    iceServers: (ticket.iceServers && ticket.iceServers.length > 0
      ? ticket.iceServers
      : FALLBACK_ICE_SERVERS) as RTCIceServer[],
  });

  let dataChannel: RTCDataChannel | null = null;
  let sessionId = '';
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
    if (sessionId) {
      sendSignaling({ v: PROTOCOL_VERSION, kind: 'client.ice', sessionId, candidate: cand });
    } else {
      pendingIce.push(cand);
    }
  });

  // The hub side opens the data channel after it receives our offer (we
  // create it locally so negotiation knows about it).
  const channel = pc.createDataChannel('rpc', { ordered: true });
  channel.binaryType = 'arraybuffer';

  // RPC plumbing
  const inflight = new Map<
    number,
    {
      controller: AbortController;
      resolve: (res: Response) => void;
      reject: (err: Error) => void;
      headEmitted: boolean;
      writer: WritableStreamDefaultWriter<Uint8Array>;
      stream: ReadableStream<Uint8Array>;
      status: number;
      headers: Headers;
    }
  >();
  let nextId = 1;

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
    if (!msg) return;
    handleRpcFrame(msg);
  });

  function sendRpc(frame: RpcMessage): void {
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(encodeRpc(frame));
    }
  }

  function handleRpcFrame(msg: RpcMessage): void {
    if (msg.kind === 'response.head') {
      const entry = inflight.get(msg.id);
      if (!entry) return;
      entry.status = msg.status;
      entry.headers = new Headers(msg.headers);
      const response = new Response(entry.stream, {
        status: msg.status,
        headers: entry.headers,
      });
      entry.headEmitted = true;
      entry.resolve(response);
    } else if (msg.kind === 'response.chunk') {
      const entry = inflight.get(msg.id);
      if (!entry) return;
      // Either a text or base64 chunk depending on the source content-type.
      const bytes = msg.dataB64
        ? Uint8Array.from(atob(msg.dataB64), (c) => c.charCodeAt(0))
        : new TextEncoder().encode(msg.dataText ?? '');
      void entry.writer.write(bytes);
    } else if (msg.kind === 'response.end') {
      const entry = inflight.get(msg.id);
      if (!entry) return;
      void entry.writer.close();
      inflight.delete(msg.id);
    } else if (msg.kind === 'response.error') {
      const entry = inflight.get(msg.id);
      if (!entry) return;
      if (!entry.headEmitted) {
        entry.reject(new Error(`RPC ${msg.id}: ${msg.code} ${msg.message ?? ''}`));
      } else {
        void entry.writer.abort(new Error(`RPC ${msg.id}: ${msg.code}`));
      }
      inflight.delete(msg.id);
    }
  }

  const handle: PeerHandle = {
    send: sendRpc,
    request(method, url, signal) {
      return new Promise<Response>((resolve, reject) => {
        const id = nextId++;
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
          status: 0,
          headers: new Headers(),
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
    },
    close() {
      try {
        channel.close();
      } catch {
        /* ignore */
      }
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };

  // Drive the SDP exchange.
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Signaling WS open timed out')), 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Signaling WS errored before open'));
    });
  });

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

  ws.addEventListener('message', async (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
    const msg = decodeSignaling(raw);
    if (!msg) return;
    if (msg.kind === 'session.iceServers') {
      // Coordinator pushes the canonical ICE list. RTCPeerConnection doesn't
      // hot-swap iceServers post-creation, so we treat this as informational.
      return;
    }
    if (msg.kind === 'session.answer') {
      sessionId = msg.sessionId;
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      for (const cand of pendingIce) {
        sendSignaling({
          v: PROTOCOL_VERSION,
          kind: 'client.ice',
          sessionId,
          candidate: cand,
        });
      }
      pendingIce.length = 0;
      return;
    }
    if (msg.kind === 'session.ice') {
      try {
        await pc.addIceCandidate({
          candidate: msg.candidate.candidate,
          sdpMid: msg.candidate.sdpMid,
          sdpMLineIndex: msg.candidate.sdpMLineIndex,
        });
      } catch {
        // Ignore — a late or malformed candidate just doesn't help.
      }
      return;
    }
    if (msg.kind === 'session.error') {
      throw new Error(`Signaling error: ${msg.code} ${msg.message ?? ''}`);
    }
  });

  // Wait for the data channel to open. WebRTC may take 1-5 seconds.
  await new Promise<void>((resolve, reject) => {
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

  return handle;
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

    let textForScan: string | null = null;

    const cached = await cache.match(url);
    if (cached) {
      // Only need to scan JS for transitive references; load text lazily.
      if (url.endsWith('.js')) {
        textForScan = await cached.clone().text();
      }
    } else {
      const mime = url.endsWith('.css')
        ? 'text/css'
        : url.endsWith('.js')
          ? 'text/javascript'
          : undefined;
      const { bytes, text, contentType } = await fetchAssetThroughPeer(peer, url, mime);
      textForScan = text;
      const response = new Response(bytes, { headers: { 'content-type': contentType } });
      // `cache.put` swallows quota errors — if the user's disk is full, we
      // still want to serve from memory this session.
      cache.put(url, response).catch((err) => dlog('cache.put failed', url, err));
    }

    if (textForScan && url.endsWith('.js')) {
      for (const match of textForScan.matchAll(ASSET_RE)) {
        if (!visited.has(match[0])) queue.push(match[0]);
      }
    }
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
    const mime = url.endsWith('.css')
      ? 'text/css'
      : url.endsWith('.js')
        ? 'text/javascript'
        : undefined;
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

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const status = createStatusSurface();
  const hubName = readHubName();
  if (!hubName) {
    status.showError('No hub specified', 'Open a URL of the form hub.brika.dev/<name>.');
    return;
  }

  const coordinator = resolveCoordinator();
  dlog('main', { hubName, coordinator, debug: DEBUG });

  // Kick off SW registration AND ticket mint in parallel — both are
  // pre-requisites and neither depends on the other.
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
    const message = err instanceof Error ? err.message : String(err);
    dlog('failed', err);
    status.showError(`Couldn't reach hub "${hubName}"`, message);
  }
}

void main();
