/**
 * Pre-fetch the hub's UI bundle through the WebRTC bridge into Cache API,
 * then inject the entry script + CSS tags so the browser picks up the
 * cached responses (via the SW) without further network traffic.
 *
 * Two HTML shapes are supported:
 *
 *  - **Production** — built UI with hashed `/assets/index-XYZ.js` + CSS.
 *    All module references live under `/assets/`, so the SW (which only
 *    intercepts that prefix) can serve everything from cache.
 *
 *  - **Vite dev** — `<script type="module" src="/src/main.tsx">` plus an
 *    optional `/@vite/client` and react-refresh preamble. Modules pull
 *    transitive deps from `/node_modules/.vite/deps/*?v=hash` and
 *    workspace packages from `/@fs/...`. The SW can't intercept those
 *    arbitrary paths, so we fall back to fetching the whole graph through
 *    the bridge, wrapping each response in a Blob URL, and rewriting
 *    every absolute-path module specifier with an importmap.
 */

import type { PeerHandle } from './peer';

const ASSET_CACHE = 'brika-assets-v1';

/** Asset references in built `/assets/index-XYZ.js` files. */
const PROD_ASSET_RE = /\/assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|json)/g;

/**
 * Absolute-path module specifiers in ES module source. Captures static
 * imports, side-effect imports, dynamic `import()`, and re-exports. Vite
 * dev rewrites every bare specifier and most relative imports into
 * absolute paths (`/src/...`, `/@fs/...`, `/node_modules/.vite/deps/...`)
 * so an absolute-path filter cleanly partitions "things the bridge needs
 * to fetch" from "specifiers the browser resolves natively (data: blob:
 * etc.)".
 *
 * Split into three narrower patterns to keep each one well under Sonar's
 * regex-complexity bound — the merged single regex tripped S5843.
 */
const DEV_IMPORT_FROM_RE = /\b(?:import|export)\b[^'"`/]*?from\s*['"]([^'"]+)['"]/g;
const DEV_IMPORT_CALL_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
const DEV_IMPORT_SIDE_RE = /\bimport\s+['"]([^'"]+)['"]/g;
const DEV_IMPORT_PATTERNS = [DEV_IMPORT_FROM_RE, DEV_IMPORT_CALL_RE, DEV_IMPORT_SIDE_RE];

/**
 * HMR-only modules. The Vite HMR client opens a WebSocket back to the dev
 * server, which would target `hub.brika.dev` (the bootstrap origin) and
 * fail. React-refresh's preamble injects globals we don't need in this
 * context either. Skipping them keeps the console quiet without affecting
 * rendering correctness.
 */
const HMR_ONLY_PATHS = new Set(['/@vite/client', '/@vite/env', '/@react-refresh']);

export interface ModuleScriptRef {
  /** Absolute hub-origin path; mutually exclusive with `inline`. */
  src?: string;
  /** Inline `<script type="module">` body; mutually exclusive with `src`. */
  inline?: string;
}

export interface AssetGraph {
  /** Module scripts to inject, in document order. */
  scripts: ModuleScriptRef[];
  /** Absolute-path stylesheets to inject upfront. */
  cssLinks: string[];
  title: string;
  /** Populated on the Blob path (dev HTML or no-SW prod). */
  blobs?: Map<string, string>;
}

function isHmrOnly(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return HMR_ONLY_PATHS.has(path);
}

function guessAssetMime(url: string): string | undefined {
  const path = url.split('?')[0] ?? url;
  if (path.endsWith('.css')) {
    return 'text/css';
  }
  if (
    path.endsWith('.js') ||
    path.endsWith('.mjs') ||
    path.endsWith('.ts') ||
    path.endsWith('.tsx') ||
    path.endsWith('.jsx')
  ) {
    return 'text/javascript';
  }
  return undefined;
}

function isJSContentType(contentType: string): boolean {
  return /\b(javascript|ecmascript)\b/i.test(contentType);
}

async function fetchThroughPeer(
  peer: PeerHandle,
  url: string
): Promise<{ bytes: ArrayBuffer; text: string | null; contentType: string }> {
  const res = await peer.request('GET', url);
  if (!res.ok) {
    throw new Error(`Hub ${url} → ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  const contentType =
    res.headers.get('content-type') ?? guessAssetMime(url) ?? 'application/octet-stream';
  const isText = /\b(javascript|ecmascript|json|css|text)\b/i.test(contentType);
  const text = isText ? new TextDecoder().decode(bytes) : null;
  return { bytes, text, contentType };
}

function scanProdChunkRefs(text: string | null, url: string, seen: Set<string>): string[] {
  if (!text || !url.endsWith('.js')) {
    return [];
  }
  const out: string[] = [];
  for (const match of text.matchAll(PROD_ASSET_RE)) {
    if (!seen.has(match[0])) {
      out.push(match[0]);
    }
  }
  return out;
}

function scanDevImports(text: string | null, contentType: string, seen: Set<string>): string[] {
  if (!text || !isJSContentType(contentType)) {
    return [];
  }
  const out: string[] = [];
  for (const re of DEV_IMPORT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (spec?.startsWith('/') && !seen.has(spec) && !isHmrOnly(spec)) {
        out.push(spec);
      }
    }
  }
  return out;
}

async function primeProdAssetCache(peer: PeerHandle, initial: readonly string[]): Promise<void> {
  const cache = await caches.open(ASSET_CACHE);
  const visited = new Set<string>();
  const queue: string[] = [...initial];
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) {
      continue;
    }
    visited.add(url);
    const cached = await cache.match(url);
    if (cached) {
      if (url.endsWith('.js')) {
        const text = await cached.clone().text();
        queue.push(...scanProdChunkRefs(text, url, visited));
      }
      continue;
    }
    const { bytes, text, contentType } = await fetchThroughPeer(peer, url);
    cache.put(url, new Response(bytes, { headers: { 'content-type': contentType } })).catch(() => {
      /* quota exceeded — still works for this session */
    });
    queue.push(...scanProdChunkRefs(text, url, visited));
  }
}

/**
 * Fetch every reachable module from {@link initial}, recursively following
 * absolute-path imports in JS responses. Each response is wrapped in a
 * Blob URL keyed by its original URL. The caller turns the resulting map
 * into an importmap so the browser resolves every dev path to the
 * pre-fetched blob.
 *
 * Resilient to 404s: a missing optional module (e.g. an experimental
 * `?import` annotation Vite emits but the bridge can't serve) doesn't
 * abort the graph build. The injected script just won't have that piece.
 */
async function buildBlobGraph(
  peer: PeerHandle,
  initial: readonly string[]
): Promise<Map<string, string>> {
  const blobs = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = initial.filter((u) => !isHmrOnly(u));
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) {
      continue;
    }
    visited.add(url);
    let result: { bytes: ArrayBuffer; text: string | null; contentType: string };
    try {
      result = await fetchThroughPeer(peer, url);
    } catch {
      continue;
    }
    const { bytes, text, contentType } = result;
    blobs.set(url, URL.createObjectURL(new Blob([bytes], { type: contentType })));
    for (const next of scanDevImports(text, contentType, visited)) {
      queue.push(next);
    }
  }
  return blobs;
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

function isDevHtml(scripts: readonly ModuleScriptRef[]): boolean {
  // Anything with an absolute-path script that isn't under `/assets/` is
  // Vite dev (`/src/`, `/@vite/`, `/@fs/`, `/@react-refresh`, …) or an
  // inline preamble. Built UIs only ever reference `/assets/`.
  return scripts.some((s) => {
    if (s.src?.startsWith('/') && !s.src.startsWith('/assets/')) {
      return true;
    }
    return s.inline !== undefined;
  });
}

/**
 * Fetch the hub's `/index.html`, extract the module entries + CSS links,
 * then either prime the SW cache (prod build, fast path) or build a Blob
 * graph + importmap (Vite dev or fallback when no SW).
 */
export async function buildAssetGraph(
  peer: PeerHandle,
  hasServiceWorker: boolean
): Promise<AssetGraph> {
  const res = await peer.request('GET', '/');
  if (!res.ok) {
    throw new Error(`Hub /index.html → ${res.status}`);
  }
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = collectScripts(doc);
  if (scripts.length === 0) {
    throw new Error('Hub UI is missing a module entry — outdated hub?');
  }

  const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href^="/"]')).map(
    (el) => el.getAttribute('href') as string
  );
  const title = doc.title;

  const dev = isDevHtml(scripts);

  if (!dev && hasServiceWorker) {
    const initial = scripts.filter((s) => s.src).map((s) => s.src as string);
    await primeProdAssetCache(peer, [...initial, ...cssLinks]);
    return { scripts, cssLinks, title };
  }

  const initial = new Set<string>();
  for (const s of scripts) {
    if (s.src?.startsWith('/')) {
      initial.add(s.src);
    }
    if (s.inline) {
      for (const spec of scanDevImports(s.inline, 'text/javascript', initial)) {
        initial.add(spec);
      }
    }
  }
  for (const css of cssLinks) {
    initial.add(css);
  }
  const blobs = await buildBlobGraph(peer, Array.from(initial));
  return { scripts, cssLinks, title, blobs };
}

/**
 * Replace the bootstrap with the hub's app. After this runs the React
 * tree no longer drives the page — the loaded UI takes over its own
 * `#root` mount.
 */
export function injectGraph(graph: AssetGraph, rootId: string): void {
  if (graph.title) {
    document.title = graph.title;
  }

  if (graph.blobs) {
    injectViaBlobs(graph, graph.blobs, rootId);
    return;
  }

  for (const css of graph.cssLinks) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = css;
    document.head.appendChild(link);
  }
  swapRoot(rootId);
  for (const s of graph.scripts) {
    if (!s.src || isHmrOnly(s.src)) {
      continue;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.src = s.src;
    document.body.appendChild(script);
  }
}

function injectViaBlobs(
  graph: AssetGraph,
  blobs: ReadonlyMap<string, string>,
  rootId: string
): void {
  const imports: Record<string, string> = {};
  for (const [url, blob] of blobs) {
    imports[url] = blob;
  }
  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({ imports });
  document.head.appendChild(importMap);

  for (const css of graph.cssLinks) {
    const blob = blobs.get(css);
    if (!blob) {
      continue;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = blob;
    document.head.appendChild(link);
  }

  swapRoot(rootId);

  for (const s of graph.scripts) {
    if (s.src && isHmrOnly(s.src)) {
      continue;
    }
    const script = document.createElement('script');
    script.type = 'module';
    if (s.src) {
      script.src = blobs.get(s.src) ?? s.src;
    } else if (s.inline) {
      script.textContent = s.inline;
    }
    document.body.appendChild(script);
  }
}

/**
 * Replace the bootstrap's React mount with a fresh empty `#root`. The
 * hub's app does `document.getElementById('root')` at startup and would
 * crash if we just removed the bootstrap's mount without recreating it.
 */
function swapRoot(rootId: string): void {
  document.getElementById(rootId)?.remove();
  const fresh = document.createElement('div');
  fresh.id = rootId;
  document.body.appendChild(fresh);
}

/**
 * Register the SW that intercepts `/assets/*` and serves from cache.
 * Returns true once the SW is controlling this page (or false if not
 * available — old browsers / private mode).
 */
export async function ensureServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (navigator.serviceWorker.controller) {
      return true;
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SW activation timed out')), 5_000);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    });
    return true;
  } catch {
    return false;
  }
}
