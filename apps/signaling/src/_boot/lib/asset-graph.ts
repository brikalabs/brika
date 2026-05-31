/**
 * Pre-fetch a hub's UI bundle through the WebRTC bridge into the SW cache,
 * then inject the entry scripts + CSS into the page. Works for both built
 * (`/assets/index-XYZ.js`) and Vite-dev (`/src/main.tsx` + `/node_modules/.vite/...`)
 * HTML — same strategy in both cases: BFS the import graph, cache every
 * reachable module, then inject the original URLs. The SW serves from cache,
 * so transitive `import './foo'` resolves naturally against a real same-origin
 * path (a `blob:` URL would break relative specifier resolution).
 */

import {
  HubDevProxyError,
  HubNotFoundError,
  HubOutdatedError,
  HubUpstreamError,
  ServiceWorkerUnavailableError,
} from './errors';
import type { PeerHandle } from './peer';

// Must match `apps/signaling/sw/sw.ts`. Bump together when the cached-shape
// contract changes OR when a deploy has poisoned client caches and needs a
// forced wipe (the SW's `activate` deletes prior `brika-assets-*` entries).
// Auto-rotates per build via Vite's `define` injection — see
// apps/signaling/vite.config.ts. Must match the SW's ASSET_CACHE in
// sw/sw.ts (both pull from the same `__BRIKA_BUILD_ID__` constant, so
// they always agree within a single build).
//
// `typeof` guard so a dev session where Vite was started BEFORE the
// `define` block was added still boots (a server restart is needed to
// pick up vite.config.ts changes; without this guard, every module
// load throws ReferenceError and the bootstrap dies).
const ASSET_CACHE = `brika-assets-${typeof __BRIKA_BUILD_ID__ === 'undefined' ? 'dev' : __BRIKA_BUILD_ID__}`;
/**
 * BFS concurrency. 16 was empirically too aggressive against a freshly-
 * booted dev hub: Vite's dep optimizer is single-threaded, so 16 cold
 * deps all hit it at once, the optimizer serializes them, the tail of
 * the queue blows the 90-second per-request budget, and those URLs end
 * up "prime skipped" with an empty cache. When the browser then fetches
 * the same URLs via `<script type="module">`, the SW has nothing cached
 * → falls through to network → Vite is *still* optimizing → 504s rain.
 * 4 keeps the optimizer's queue short enough that every cold request
 * completes well under timeout; the total wall-clock for cold-starting
 * the whole hub UI's dep tree barely changes since it was Vite-bound,
 * not network-bound, in the first place.
 */
const PRIME_PARALLELISM = 4;

// Module specifiers: static + side-effect + dynamic imports. The
// side-effect form needs `\s*` (not `\s+`) — Vite's minifier emits
// `import"./foo.js"` with zero whitespace, and `\s+` would miss those.
// Backticks must be in the quote class: Rolldown/Vite emit dynamic
// imports as `import(\`./chunk.js\`)` (template literal, no
// interpolation). Missing them means the BFS sees zero dynamic-import
// chunks — every code-split route (sw-proxy, users, auth, blocks, …)
// stays uncached, the SW falls through to the CF Worker, the SPA
// fallback returns HTML for the JS URL, and `<script type="module">`
// dies with `Failed to load module script: … text/html`.
const IMPORT_RE =
  /\b(?:import\s*\(|(?:import|export)[^'"`]*?from\s*|import\s*)['"`]([^'"`]+)['"`]/g;
// Asset URLs referenced from CSS (`url(...)`). Bounded quantifiers keep matching linear.
const CSS_URL_RE = /url\(\s{0,8}['"]?([^\s)'"]{1,2048})['"]?\s{0,8}\)/g;

const VITE_HMR_PATHS = new Set(['/@vite/client', '/@vite/env']);

// Replace Vite's HMR client with a no-op shim — the real one opens a WebSocket
// back to localhost:5173 from `hub.brika.dev`, which fails noisily. `updateStyle`
// must be real: Vite's dev CSS-modules pipeline calls it for every `.css` import.
const VITE_CLIENT_STUB = `
const noop = () => {};
const noopCtx = { accept: noop, acceptExports: noop, dispose: noop, prune: noop,
  decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} };
export const createHotContext = () => noopCtx;
const sheets = new Map();
export function updateStyle(id, content) {
  let el = sheets.get(id);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
    sheets.set(id, el);
  }
  el.textContent = content;
}
export function removeStyle(id) {
  const el = sheets.get(id);
  if (el) { el.remove(); sheets.delete(id); }
}
export const injectQuery = (url) => url;
export class ErrorOverlay extends HTMLElement {}
export const overlayId = 'brika-vite-overlay-disabled';
`;

export interface ModuleScriptRef {
  src?: string;
  inline?: string;
}

export interface AssetGraph {
  scripts: ModuleScriptRef[];
  cssLinks: string[];
  title: string;
  hubName: string;
}

export interface AssetGraphProgress {
  fetched: number;
  url: string;
}

export type ProgressListener = (event: AssetGraphProgress) => void;

const pathOf = (url: string) => url.split('?')[0] ?? url;
const isAbsolutePath = (s: string) => s.startsWith('/') && !s.startsWith('//');
const isViteHmr = (url: string) => VITE_HMR_PATHS.has(pathOf(url));
const isJS = (ct: string) => /\b(?:javascript|ecmascript)\b/i.test(ct);
const isCSS = (ct: string) => /\bcss\b/i.test(ct);

function guessMime(url: string): string | undefined {
  const p = pathOf(url);
  if (p.endsWith('.css')) {
    return 'text/css';
  }
  if (/\.(?:m?js|tsx?|jsx)$/.test(p)) {
    return 'text/javascript';
  }
  return undefined;
}

async function fetchThroughPeer(
  peer: PeerHandle,
  url: string
): Promise<{ response: Response; text: string | null; contentType: string }> {
  let res = await peer.request('GET', url);
  // Single retry on 504. Vite's dep optimizer returns 504 when it can't
  // finish optimizing a transitive dep before the hub's proxy timeout —
  // very common on a cold-start when many requests hit the optimizer at
  // once. By the time we get back here, the optimizer has usually
  // finished (parallelism is bounded above), so the second try lands on
  // a warm cache and returns in ms. Without this, transitive deps that
  // lost the cold-start race go to "prime skipped", the cache stays
  // empty for them, and post-`done` script-tag fetches 504 against the
  // same warm Vite — but the boot has already moved on.
  if (res.status === 504) {
    await new Promise((r) => setTimeout(r, 250));
    res = await peer.request('GET', url);
  }
  if (!res.ok) {
    throw new HubUpstreamError(url, res.status);
  }
  const bytes = await res.arrayBuffer();
  const headerType = res.headers.get('content-type');
  const guessed = guessMime(url);
  // Dev-ui-proxy returning HTML for a script URL means the hub's UI dev server is down.
  if (headerType?.includes('text/html') && guessed === 'text/javascript') {
    throw new HubDevProxyError(url);
  }
  const contentType = headerType ?? guessed ?? 'application/octet-stream';
  const isText = /\b(?:javascript|ecmascript|json|css|text)\b/i.test(contentType);
  const text = isText ? new TextDecoder().decode(bytes) : null;
  // Re-wrap so the SW cache always sees a proper `content-type` header.
  return {
    response: new Response(bytes, { headers: { 'content-type': contentType } }),
    text,
    contentType,
  };
}

/**
 * Resolve a specifier against the importer's path, returning a same-origin
 * pathname or null. Handles absolute (`/foo`) and relative (`./foo`, `../foo`)
 * forms in dev and prod alike — Vite-built chunks import relatively, dev-mode
 * Vite serves absolute paths. Cross-origin (`https://…`, `//cdn`) and `data:`
 * specifiers are dropped before URL parsing.
 */
function resolveSamePath(raw: string | undefined, baseUrl: string): string | null {
  if (!raw || /^(?:data:|https?:|\/\/)/i.test(raw)) {
    return null;
  }
  // Reject bare specifiers (`react`, `MyComponent`, `date-fns/locale/eo`).
  // The IMPORT_RE picks them up when minified bundles embed examples in
  // JSDoc strings or stringified module paths, but joining a bare name
  // against the base URL produces a sibling path (`/parent/react`) that
  // the hub then 404s — pure noise. Built bundles only ever import via
  // concrete paths (`./chunk-XYZ.js`, `/assets/foo.js`); Vite-dev cases
  // that legitimately use bare specifiers resolve through the dev
  // server's own resolver, not our BFS.
  if (!/^(?:\.{1,2}\/|\/)/.test(raw)) {
    return null;
  }
  // Template-literal placeholders that survived the regex match — we
  // can't statically resolve `${X}` to a real path, so don't queue it.
  if (raw.includes('${')) {
    return null;
  }
  try {
    const url = new URL(raw, `${location.origin}${baseUrl}`);
    return url.origin === location.origin && isAbsolutePath(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

function scanJSImports(text: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const resolved = resolveSamePath(m[1], baseUrl);
    if (resolved) {
      out.push(resolved);
    }
  }
  return out;
}

function scanCSSUrls(text: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CSS_URL_RE)) {
    const resolved = resolveSamePath(m[1], baseUrl);
    if (resolved) {
      out.push(resolved);
    }
  }
  return out;
}

function nextRefs(text: string | null, contentType: string, url: string): string[] {
  if (!text) {
    return [];
  }
  if (isJS(contentType)) {
    return scanJSImports(text, url);
  }
  if (isCSS(contentType)) {
    return scanCSSUrls(text, url);
  }
  return [];
}

async function primeCache(
  peer: PeerHandle,
  initial: readonly string[],
  onProgress?: ProgressListener
): Promise<void> {
  const cache = await caches.open(ASSET_CACHE);
  const visited = new Set<string>(initial);
  const essential = new Set<string>(initial);
  const queue = [...initial];
  const inflight = new Set<Promise<void>>();
  let stopErr: Error | null = null;
  let fetched = 0;

  const recordFetched = (url: string): void => {
    fetched++;
    onProgress?.({ fetched, url });
  };

  const enqueueRefs = (refs: readonly string[]): void => {
    for (const ref of refs) {
      if (!visited.has(ref)) {
        visited.add(ref);
        queue.push(ref);
      }
    }
  };

  // A stale cache entry can mask a broken deploy: if a prior session
  // cached the hub UI's entry under a content-type the browser then
  // rejects (or with HTML bytes JS parsing chokes on), every subsequent
  // boot short-circuits and the user sees the same MIME error forever.
  // Log essential cache hits so the next debug session can see what's
  // actually being served.
  const noteCacheHit = (url: string, existing: Response): void => {
    if (!essential.has(url)) {
      return;
    }
    console.log('[brika-bootstrap] prime cache hit', {
      url,
      status: existing.status,
      contentType: existing.headers.get('content-type'),
    });
  };

  // Initial URLs are the entry scripts + CSS the hub's index.html
  // directly references — non-optional. Silently dropping them lets
  // the bootstrap reach "done" with an empty cache, and the browser
  // then hits the SPA-origin fallback with a misleading text/html
  // MIME error. Propagate ANY error here (not just BootstrapError —
  // `peer.request` rejects with a plain `Error` on timeout / channel
  // close / mid-stream abort, which would otherwise slip past).
  // Transitive refs can legitimately 404 (a stale asset URL in CSS,
  // a removed dynamic import) — log but don't abort.
  //
  // HubDevProxyError on a transitive ref is *not* a sign the dev proxy
  // is broken: Vite's SPA fallback returns 200 + text/html for any URL
  // it doesn't recognise, so an over-reach by IMPORT_RE (a string
  // literal that looks like an import but isn't a real chunk) silently
  // turns into "HTML where JS was expected" the moment the BFS asks
  // for it. Only treat HubDevProxyError as fatal when it hits an
  // *essential* URL (one of the entry scripts) — at that point Vite
  // really is misconfigured and we should fail loudly. Otherwise skip.
  const recordFetchError = (url: string, err: unknown): void => {
    if (err instanceof HubDevProxyError && essential.has(url)) {
      stopErr = err;
      return;
    }
    if (essential.has(url)) {
      stopErr = err instanceof Error ? err : new Error(String(err));
      return;
    }
    console.warn('[brika-bootstrap] prime skipped', {
      url,
      err: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  };

  // Re-scan a cache-hit body for transitive refs. Without this, a prior
  // session that primed the entry but failed mid-BFS (a vendor chunk
  // 404'd, an RPC timed out) leaves the cache in a state where every
  // subsequent boot short-circuits on the entry without ever queueing
  // its imports — the user is stuck on a partial prime forever. Reading
  // the body costs one cache-roundtrip per cached node, cheap compared
  // to the WebRTC round-trip we'd otherwise pay to refetch.
  const rescanCached = async (url: string, existing: Response): Promise<void> => {
    const ct = existing.headers.get('content-type') ?? '';
    if (!isJS(ct) && !isCSS(ct)) {
      return;
    }
    let text: string;
    try {
      text = await existing.text();
    } catch {
      return;
    }
    enqueueRefs(nextRefs(text, ct, url));
  };

  const processOne = async (url: string): Promise<void> => {
    if (stopErr) {
      return;
    }
    const existing = await cache.match(url);
    if (existing) {
      noteCacheHit(url, existing);
      await rescanCached(url, existing);
      return;
    }
    if (isViteHmr(url)) {
      await cache.put(
        url,
        new Response(VITE_CLIENT_STUB, { headers: { 'content-type': 'text/javascript' } })
      );
      recordFetched(url);
      return;
    }
    let result: Awaited<ReturnType<typeof fetchThroughPeer>>;
    try {
      result = await fetchThroughPeer(peer, url);
    } catch (err) {
      recordFetchError(url, err);
      return;
    }
    await cache.put(url, result.response);
    recordFetched(url);
    enqueueRefs(nextRefs(result.text, result.contentType, url));
  };

  // Worker-pool BFS: PRIME_PARALLELISM fetches in flight at once, refilled from
  // the queue as each completes. Sequential would be 30s+ on Vite's ~3000-module graph.
  while (queue.length > 0 || inflight.size > 0) {
    while (queue.length > 0 && inflight.size < PRIME_PARALLELISM && !stopErr) {
      const url = queue.shift();
      if (!url) {
        break;
      }
      const task = processOne(url).finally(() => inflight.delete(task));
      inflight.add(task);
    }
    if (inflight.size === 0) {
      break;
    }
    await Promise.race(inflight);
  }
  await Promise.all(inflight);
  if (stopErr) {
    throw stopErr;
  }
}

function collectScripts(doc: Document): ModuleScriptRef[] {
  const out: ModuleScriptRef[] = [];
  for (const el of doc.querySelectorAll('script[type="module"]')) {
    const src = el.getAttribute('src');
    if (src) {
      out.push({ src });
      continue;
    }
    const inline = el.textContent;
    if (inline?.trim()) {
      out.push({ inline });
    }
  }
  return out;
}

async function fetchHubIndexHtml(peer: PeerHandle, hubName: string): Promise<string> {
  const res = await peer.request('GET', '/');
  if (res.status === 404) {
    throw new HubNotFoundError(hubName);
  }
  if (!res.ok) {
    throw new HubUpstreamError('/index.html', res.status);
  }
  return res.text();
}

function collectInitialUrls(scripts: ModuleScriptRef[], cssLinks: string[]): Set<string> {
  const initial = new Set<string>();
  for (const s of scripts) {
    if (s.src && isAbsolutePath(s.src)) {
      initial.add(s.src);
    }
    if (s.inline) {
      for (const spec of scanJSImports(s.inline, '/')) {
        initial.add(spec);
      }
    }
  }
  for (const css of cssLinks) {
    if (isAbsolutePath(css)) {
      initial.add(css);
    }
  }
  return initial;
}

export async function buildAssetGraph(
  peer: PeerHandle,
  hubName: string,
  hasServiceWorker: boolean,
  onProgress?: ProgressListener
): Promise<AssetGraph> {
  if (!hasServiceWorker) {
    throw new ServiceWorkerUnavailableError();
  }

  const html = await fetchHubIndexHtml(peer, hubName);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = collectScripts(doc);
  if (scripts.length === 0) {
    throw new HubOutdatedError();
  }

  const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href^="/"]'))
    .map((el) => el.getAttribute('href'))
    .filter((href): href is string => href !== null);

  const initial = collectInitialUrls(scripts, cssLinks);
  await primeCache(peer, Array.from(initial), onProgress);
  return { scripts, cssLinks, title: doc.title, hubName };
}

/**
 * Swap the bootstrap page for the hub's app: stamp `<meta name="brika:hub">`
 * for `detectRemote()`, load the hub's stylesheets BEFORE removing the
 * bootstrap's (no FOUC), replace `#root`, and append the hub's scripts.
 * After this the React tree no longer drives the page.
 */
export async function injectGraph(graph: AssetGraph, rootId: string): Promise<void> {
  if (graph.title) {
    document.title = graph.title;
  }

  // Pre-existing tags would shadow our stamp (UI reads the FIRST `brika:hub`).
  // Drop any leftover from a previous bootstrap attempt before re-stamping.
  for (const existing of document.head.querySelectorAll('meta[name="brika:hub"]')) {
    existing.remove();
  }
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'brika:hub');
  meta.setAttribute('content', graph.hubName);
  document.head.appendChild(meta);
  console.log('[brika-bootstrap] meta stamped', {
    hubName: graph.hubName,
    readBack: document.querySelector('meta[name="brika:hub"]')?.getAttribute('content') ?? null,
    metaCount: document.querySelectorAll('meta[name="brika:hub"]').length,
  });

  const oldStyles = [
    ...document.head.querySelectorAll('link[rel="stylesheet"]'),
    ...document.head.querySelectorAll('style'),
  ];
  await Promise.all(graph.cssLinks.map(appendStylesheet));
  for (const node of oldStyles) {
    node.remove();
  }

  document.getElementById(rootId)?.remove();
  const fresh = document.createElement('div');
  fresh.id = rootId;
  document.body.appendChild(fresh);

  console.log('[brika-bootstrap] about to append scripts', {
    metaPresent: document.querySelector('meta[name="brika:hub"]')?.getAttribute('content') ?? null,
    scriptCount: graph.scripts.length,
  });
  for (const s of graph.scripts) {
    if (s.src && isViteHmr(s.src)) {
      continue;
    }
    const script = document.createElement('script');
    script.type = 'module';
    if (s.src) {
      script.src = s.src;
    } else if (s.inline) {
      script.textContent = s.inline;
    }
    document.body.appendChild(script);
  }
}

function appendStylesheet(href: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}
