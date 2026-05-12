/**
 * Pre-fetch the hub's UI bundle through the WebRTC bridge into Cache API,
 * then inject the entry script + CSS tags so the browser picks up the
 * cached responses (via the SW) without further network traffic.
 *
 * Two HTML shapes are supported:
 *
 *  - **Production** — built UI with hashed `/assets/index-XYZ.js` + CSS.
 *  - **Vite dev** — `<script type="module" src="/src/main.tsx">` plus an
 *    inline react-refresh preamble. Modules pull transitive deps from
 *    `/node_modules/.vite/deps/*?v=hash` and workspace packages from
 *    `/@fs/...`.
 *
 * In both cases the strategy is identical:
 *
 *   1. Fetch every reachable absolute-path module through the bridge.
 *   2. Stash each response in the SW cache keyed by its original URL.
 *   3. Inject the original `<script src="…">` / `<link href="…">` tags.
 *      The browser fetches those URLs, the SW serves from cache, and
 *      every relative + absolute-path import inside resolves naturally
 *      because the module's URL is a real same-origin path — not a
 *      blob: URL (whose base isn't hierarchical and breaks `/foo`
 *      specifier resolution per the HTML spec).
 */

import type { PeerHandle } from './peer';

const ASSET_CACHE = 'brika-assets-v1';

/**
 * Absolute-path module specifiers in ES module source. Captures static
 * imports, side-effect imports, dynamic `import()`, and re-exports. Vite
 * dev rewrites every bare specifier and most relative imports into
 * absolute paths (`/src/...`, `/@fs/...`, `/node_modules/.vite/deps/...`)
 * so an absolute-path filter cleanly partitions "things the bridge needs
 * to fetch" from "specifiers the browser resolves natively (data: blob:
 * etc.)".
 *
 * Split into three narrower patterns to stay well under Sonar's
 * regex-complexity bound — a merged single regex tripped S5843.
 */
const IMPORT_FROM_RE = /\b(?:import|export)\b[^'"`/]*?from\s*['"]([^'"]+)['"]/g;
const IMPORT_CALL_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
const IMPORT_SIDE_RE = /\bimport\s+['"]([^'"]+)['"]/g;
const IMPORT_PATTERNS = [IMPORT_FROM_RE, IMPORT_CALL_RE, IMPORT_SIDE_RE];

/**
 * Asset URLs referenced from CSS (background-image, @font-face, etc).
 * Vite serves these from `/assets/` in prod and `/@fs/` (or `/src/`) in
 * dev — both are absolute paths so the same scan works.
 */
const CSS_URL_RE = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/g;

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
  /** Absolute-path stylesheets to inject. */
  cssLinks: string[];
  title: string;
}

export interface AssetGraphProgress {
  /** Number of resources fetched + cached so far. */
  fetched: number;
  /** URL of the most recent fetch (current or just completed). */
  url: string;
}

export type ProgressListener = (event: AssetGraphProgress) => void;

function isHmrOnly(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return HMR_ONLY_PATHS.has(path);
}

function isAbsolutePath(spec: string): boolean {
  return spec.startsWith('/') && !spec.startsWith('//');
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

function isCSSContentType(contentType: string): boolean {
  return /\bcss\b/i.test(contentType);
}

async function fetchThroughPeer(
  peer: PeerHandle,
  url: string
): Promise<{ response: Response; text: string | null; contentType: string }> {
  const res = await peer.request('GET', url);
  if (!res.ok) {
    throw new Error(`Hub ${url} → ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  const contentType =
    res.headers.get('content-type') ?? guessAssetMime(url) ?? 'application/octet-stream';
  const isText = /\b(javascript|ecmascript|json|css|text)\b/i.test(contentType);
  const text = isText ? new TextDecoder().decode(bytes) : null;
  // Re-wrap as a fresh Response so the SW cache always sees a `text/...`
  // header even when the bridge passed `application/octet-stream`.
  // `cache.put` consumes the body; we hand back a clone for that path.
  const response = new Response(bytes, { headers: { 'content-type': contentType } });
  return { response, text, contentType };
}

function scanJSImports(text: string, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const re of IMPORT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (spec && isAbsolutePath(spec) && !seen.has(spec) && !isHmrOnly(spec)) {
        out.push(spec);
      }
    }
  }
  return out;
}

function scanCSSUrls(text: string, baseUrl: string, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CSS_URL_RE)) {
    const raw = m[1];
    if (!raw || raw.startsWith('data:') || raw.startsWith('http:') || raw.startsWith('https:')) {
      continue;
    }
    // Resolve relative to the CSS file's URL so e.g. `url(./foo.png)`
    // becomes `/assets/foo.png` and gets pre-cached too.
    let resolved: string;
    try {
      resolved = new URL(raw, `https://placeholder${baseUrl}`).pathname;
    } catch {
      continue;
    }
    if (isAbsolutePath(resolved) && !seen.has(resolved)) {
      out.push(resolved);
    }
  }
  return out;
}

function nextRefs(
  text: string | null,
  contentType: string,
  url: string,
  seen: Set<string>
): string[] {
  if (!text) {
    return [];
  }
  if (isJSContentType(contentType)) {
    return scanJSImports(text, seen);
  }
  if (isCSSContentType(contentType)) {
    return scanCSSUrls(text, url, seen);
  }
  return [];
}

/**
 * Walk the module graph reachable from `initial`, fetching each entry
 * through the bridge and storing the response in the SW cache. The
 * browser will then resolve module imports to the original URLs and the
 * SW intercepts each request, serving from cache.
 */
async function primeCache(
  peer: PeerHandle,
  initial: readonly string[],
  onProgress?: ProgressListener
): Promise<number> {
  const cache = await caches.open(ASSET_CACHE);
  const visited = new Set<string>();
  const queue: string[] = initial.filter((u) => !isHmrOnly(u));
  let fetched = 0;
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url) || isHmrOnly(url)) {
      continue;
    }
    visited.add(url);
    if (await cache.match(url)) {
      // Already primed from a previous attempt — still want to follow
      // its transitive refs in case the graph grew.
      continue;
    }
    let fetchResult: { response: Response; text: string | null; contentType: string };
    try {
      fetchResult = await fetchThroughPeer(peer, url);
    } catch {
      // 404s on optional resources (some `?import` queries Vite emits)
      // shouldn't abort the whole graph — the injected script just
      // won't have that piece.
      continue;
    }
    const { response, text, contentType } = fetchResult;
    await cache.put(url, response);
    fetched += 1;
    onProgress?.({ fetched, url });
    queue.push(...nextRefs(text, contentType, url, visited));
  }
  return fetched;
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

/**
 * Fetch the hub's `/index.html`, extract the module entries + CSS links,
 * then prime the SW cache with the entire reachable graph.
 */
export async function buildAssetGraph(
  peer: PeerHandle,
  hasServiceWorker: boolean,
  onProgress?: ProgressListener
): Promise<AssetGraph> {
  if (!hasServiceWorker) {
    throw new Error('Service worker required — browser does not support SW or it was blocked');
  }

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

  // Initial fetch set: every absolute-path script src, every inline-block
  // import specifier, every CSS link.
  const initial = new Set<string>();
  for (const s of scripts) {
    if (s.src && isAbsolutePath(s.src)) {
      initial.add(s.src);
    }
    if (s.inline) {
      for (const spec of scanJSImports(s.inline, initial)) {
        initial.add(spec);
      }
    }
  }
  for (const css of cssLinks) {
    if (isAbsolutePath(css)) {
      initial.add(css);
    }
  }

  await primeCache(peer, Array.from(initial), onProgress);
  return { scripts, cssLinks, title };
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

  for (const css of graph.cssLinks) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = css;
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
      script.src = s.src;
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
 * Register the SW that intercepts every cached same-origin GET. Returns
 * true once the SW is controlling this page (or false if not available —
 * old browsers / private mode).
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
