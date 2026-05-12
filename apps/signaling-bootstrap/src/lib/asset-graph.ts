/**
 * Pre-fetch the hub's UI bundle through the WebRTC bridge into Cache API,
 * then inject the entry script + CSS tags so the browser picks up the
 * cached responses (via the SW) without further network traffic.
 */

import type { PeerHandle } from './peer';

const ASSET_CACHE = 'brika-assets-v1';
const ASSET_RE = /\/assets\/[A-Za-z0-9._-]+\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|json)/g;

export interface AssetGraph {
  entryUrl: string;
  cssUrls: string[];
  title: string;
  /** Only populated on the no-SW path (Blob URLs for entry + chunks + CSS). */
  blobs?: Map<string, string>;
}

function guessAssetMime(url: string): string | undefined {
  if (url.endsWith('.css')) {
    return 'text/css';
  }
  if (url.endsWith('.js')) {
    return 'text/javascript';
  }
  return undefined;
}

async function fetchThroughPeer(
  peer: PeerHandle,
  url: string,
  mime: string | undefined
): Promise<{ bytes: ArrayBuffer; text: string | null; contentType: string }> {
  const res = await peer.request('GET', url);
  if (!res.ok) {
    throw new Error(`Hub ${url} → ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  const contentType = mime ?? res.headers.get('content-type') ?? 'application/octet-stream';
  const isText = /\b(javascript|json|css|text)\b/i.test(contentType);
  const text = isText ? new TextDecoder().decode(bytes) : null;
  return { bytes, text, contentType };
}

async function fetchOrCache(cache: Cache, peer: PeerHandle, url: string): Promise<string | null> {
  const cached = await cache.match(url);
  if (cached) {
    return url.endsWith('.js') ? await cached.clone().text() : null;
  }
  const { bytes, text, contentType } = await fetchThroughPeer(peer, url, guessAssetMime(url));
  const response = new Response(bytes, { headers: { 'content-type': contentType } });
  cache.put(url, response).catch(() => {
    /* quota exceeded — still works for this session */
  });
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
    if (!visited.has(match[0])) {
      queue.push(match[0]);
    }
  }
}

async function primeAssetCache(peer: PeerHandle, initial: readonly string[]): Promise<void> {
  const cache = await caches.open(ASSET_CACHE);
  const visited = new Set<string>();
  const queue: string[] = [...initial];
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) {
      continue;
    }
    visited.add(url);
    const text = await fetchOrCache(cache, peer, url);
    scanForChunkRefs(text, url, queue, visited);
  }
}

async function buildBlobGraph(
  peer: PeerHandle,
  initial: readonly string[]
): Promise<Map<string, string>> {
  const blobs = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [...initial];
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) {
      continue;
    }
    visited.add(url);
    const { bytes, text, contentType } = await fetchThroughPeer(peer, url, guessAssetMime(url));
    blobs.set(url, URL.createObjectURL(new Blob([bytes], { type: contentType })));
    scanForChunkRefs(text, url, queue, visited);
  }
  return blobs;
}

/**
 * Fetch the hub's `/index.html`, extract entry + CSS URLs, then either
 * prime the SW cache (preferred) or build Blob URLs as a fallback.
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
  const entryEl = doc.querySelector('script[type="module"][src^="/assets/"]');
  const entryUrl = entryEl?.getAttribute('src');
  if (!entryUrl) {
    throw new Error('Hub UI is missing a module entry — outdated hub?');
  }
  const cssUrls = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]')).map(
    (el) => el.getAttribute('href') as string
  );
  const title = doc.title;

  if (hasServiceWorker) {
    await primeAssetCache(peer, [entryUrl, ...cssUrls]);
    return { entryUrl, cssUrls, title };
  }
  const blobs = await buildBlobGraph(peer, [entryUrl, ...cssUrls]);
  return { entryUrl, cssUrls, title, blobs };
}

/**
 * Replace the bootstrap with the hub's app. After this runs, the React
 * tree no longer drives the page — the loaded UI takes over.
 */
export function injectGraph(graph: AssetGraph, rootId: string): void {
  if (graph.title) {
    document.title = graph.title;
  }

  if (graph.blobs) {
    const imports: Record<string, string> = {};
    for (const [original, blob] of graph.blobs) {
      if (original.endsWith('.js')) {
        imports[original] = blob;
      }
    }
    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({ imports });
    document.head.appendChild(importMap);
    for (const css of graph.cssUrls) {
      const blob = graph.blobs.get(css);
      if (!blob) {
        continue;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = blob;
      document.head.appendChild(link);
    }
    document.getElementById(rootId)?.remove();
    const entry = document.createElement('script');
    entry.type = 'module';
    entry.src = graph.blobs.get(graph.entryUrl) ?? graph.entryUrl;
    document.body.appendChild(entry);
    return;
  }

  for (const css of graph.cssUrls) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = css;
    document.head.appendChild(link);
  }
  document.getElementById(rootId)?.remove();
  const entry = document.createElement('script');
  entry.type = 'module';
  entry.src = graph.entryUrl;
  document.body.appendChild(entry);
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
