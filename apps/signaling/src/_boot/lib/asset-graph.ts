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

// Must match `public/sw.js`. Bump together when the cached-shape contract changes.
const ASSET_CACHE = 'brika-assets-v5';
const PRIME_PARALLELISM = 16;

// Absolute-path module specifiers: static + side-effect + dynamic imports.
const IMPORT_RE = /\b(?:import\s*\(|(?:import|export)[^'"]*?from\s*|import\s+)['"]([^'"]+)['"]/g;
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
  const res = await peer.request('GET', url);
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

function scanJSImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec && isAbsolutePath(spec)) {
      out.push(spec);
    }
  }
  return out;
}

function scanCSSUrls(text: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CSS_URL_RE)) {
    const raw = m[1];
    if (!raw || /^(?:data:|https?:)/i.test(raw)) {
      continue;
    }
    try {
      const resolved = new URL(raw, `https://placeholder${baseUrl}`).pathname;
      if (isAbsolutePath(resolved)) {
        out.push(resolved);
      }
    } catch {
      /* skip unparseable */
    }
  }
  return out;
}

function nextRefs(text: string | null, contentType: string, url: string): string[] {
  if (!text) {
    return [];
  }
  if (isJS(contentType)) {
    return scanJSImports(text);
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
  const queue = [...initial];
  const inflight = new Set<Promise<void>>();
  let stopErr: HubDevProxyError | null = null;
  let fetched = 0;

  const processOne = async (url: string): Promise<void> => {
    if (stopErr || (await cache.match(url))) {
      return;
    }
    if (isViteHmr(url)) {
      await cache.put(
        url,
        new Response(VITE_CLIENT_STUB, { headers: { 'content-type': 'text/javascript' } })
      );
      fetched++;
      onProgress?.({ fetched, url });
      return;
    }
    let result: Awaited<ReturnType<typeof fetchThroughPeer>>;
    try {
      result = await fetchThroughPeer(peer, url);
    } catch (err) {
      if (err instanceof HubDevProxyError) {
        stopErr = err;
      }
      // 404s on optional resources shouldn't abort the whole graph.
      return;
    }
    await cache.put(url, result.response);
    fetched++;
    onProgress?.({ fetched, url });
    for (const ref of nextRefs(result.text, result.contentType, url)) {
      if (!visited.has(ref)) {
        visited.add(ref);
        queue.push(ref);
      }
    }
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

export async function buildAssetGraph(
  peer: PeerHandle,
  hubName: string,
  hasServiceWorker: boolean,
  onProgress?: ProgressListener
): Promise<AssetGraph> {
  if (!hasServiceWorker) {
    throw new ServiceWorkerUnavailableError();
  }

  const res = await peer.request('GET', '/');
  if (res.status === 404) {
    throw new HubNotFoundError(hubName);
  }
  if (!res.ok) {
    throw new HubUpstreamError('/index.html', res.status);
  }
  const html = await res.text();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = collectScripts(doc);
  if (scripts.length === 0) {
    throw new HubOutdatedError();
  }

  const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href^="/"]'))
    .map((el) => el.getAttribute('href'))
    .filter((href): href is string => href !== null);

  const initial = new Set<string>();
  for (const s of scripts) {
    if (s.src && isAbsolutePath(s.src)) {
      initial.add(s.src);
    }
    if (s.inline) {
      for (const spec of scanJSImports(s.inline)) {
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
    readBack:
      document.querySelector('meta[name="brika:hub"]')?.getAttribute('content') ?? null,
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
    metaPresent:
      document.querySelector('meta[name="brika:hub"]')?.getAttribute('content') ?? null,
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
