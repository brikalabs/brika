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

// Keep in sync with `public/sw.js` — they must agree on the cache name
// for the bootstrap's `cache.put()` to be visible to the SW's
// `cache.match()`.
const ASSET_CACHE = 'brika-assets-v2';

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
 *
 * Quantifiers are bounded so the regex is provably linear and can't be
 * tripped into super-linear matching by adversarial CSS (Sonar S5852).
 */
const CSS_URL_RE = /url\(\s{0,8}['"]?([^)'"]{1,2048})['"]?\s{0,8}\)/g;

/**
 * Module paths we don't want to *inject* as top-level scripts because
 * they'd open a WebSocket back to the dev server (which would target
 * `hub.brika.dev` and fail noisily). They're still cached so transitive
 * imports resolve through the SW.
 *
 * `/@react-refresh` is NOT in this set: the inline preamble Vite emits
 * imports it and calls `injectIntoGlobalHook(window)`, then sets the
 * `$RefreshReg$` / `$RefreshSig$` globals every transformed component
 * file references. Skipping it would crash the first component render.
 */
const NO_INJECT_PATHS = new Set(['/@vite/client', '/@vite/env']);

/**
 * Stub body served in place of Vite's HMR client at cache time. Real
 * `/@vite/client` opens a WebSocket back to the dev server and, on
 * failure, falls through to a `EventSource` retry loop — both noisy
 * and useless when the page is served from `hub.brika.dev` rather than
 * `localhost:5173`. The transformed source files Vite emits import
 * `createHotContext` from this module and call `.accept()` / `.dispose()`
 * etc., so the stub has to expose a callable shape; everything is a
 * no-op so HMR is effectively turned off without crashing the imports.
 */
const VITE_CLIENT_STUB = `
const noop = () => {};
const noopCtx = {
  accept: noop, acceptExports: noop, dispose: noop, prune: noop,
  decline: noop, invalidate: noop, on: noop, off: noop, send: noop,
  data: {},
};
export const createHotContext = () => noopCtx;
export const updateStyle = noop;
export const removeStyle = noop;
export const injectQuery = (url) => url;
export const ErrorOverlay = class extends HTMLElement {};
export const overlayId = 'brika-vite-overlay-disabled';
`;

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

function shouldNotInject(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return NO_INJECT_PATHS.has(path);
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

/**
 * Thrown by {@link fetchThroughPeer} when the hub returns HTML for a URL
 * that should have produced a JS module. Almost always means the dev
 * UI proxy lost its upstream Vite server and every unknown path is
 * getting the SPA-fallback `index.html`. Distinct class so primeCache
 * can tell it apart from normal 404s (which it tolerates).
 */
class HtmlForModuleError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Hub returned HTML for ${url} — is the dev UI proxy reachable (Vite running)?`);
    this.name = 'HtmlForModuleError';
    this.url = url;
  }
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
  const headerType = res.headers.get('content-type');
  const guessed = guessAssetMime(url);
  if (headerType?.includes('text/html') && guessed === 'text/javascript') {
    throw new HtmlForModuleError(url);
  }
  const contentType = headerType ?? guessed ?? 'application/octet-stream';
  const isText = /\b(javascript|ecmascript|json|css|text)\b/i.test(contentType);
  const text = isText ? new TextDecoder().decode(bytes) : null;
  // Re-wrap as a fresh Response so the SW cache always sees a `text/...`
  // header even when the bridge passed `application/octet-stream`.
  const response = new Response(bytes, { headers: { 'content-type': contentType } });
  return { response, text, contentType };
}

function scanJSImports(text: string, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const re of IMPORT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (spec && isAbsolutePath(spec) && !seen.has(spec)) {
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
  const queue: string[] = [...initial];
  let fetched = 0;
  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) {
      continue;
    }
    visited.add(url);
    if (await cache.match(url)) {
      // Already primed from a previous attempt — still want to follow
      // its transitive refs in case the graph grew.
      continue;
    }
    // Neutralize Vite's HMR runtime so the imports resolve to a no-op
    // module instead of attempting (and failing) a WS/SSE back-channel
    // from the bootstrap origin to localhost:5173.
    if (shouldNotInject(url)) {
      await cache.put(
        url,
        new Response(VITE_CLIENT_STUB, { headers: { 'content-type': 'text/javascript' } })
      );
      fetched += 1;
      onProgress?.({ fetched, url });
      continue;
    }
    let fetchResult: { response: Response; text: string | null; contentType: string };
    try {
      fetchResult = await fetchThroughPeer(peer, url);
    } catch (err) {
      // A misconfigured dev hub (Vite down, dev-ui-proxy misrouting)
      // returns HTML for every module URL; that's a user-actionable
      // setup error, not a transient 404, so let it propagate.
      if (err instanceof HtmlForModuleError) {
        throw err;
      }
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
    if (s.src && shouldNotInject(s.src)) {
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
 * Keep in sync with the `SW_VERSION` constant in `public/sw.js`. The
 * bootstrap pings `/__brika_sw_ping__` after registering; if the SW
 * doesn't respond with this exact string the SW is stale and we force
 * a one-time auto-reload to pick up the fresh worker.
 */
const EXPECTED_SW_VERSION = '2';
const SW_PING_PATH = '/__brika_sw_ping__';
const RELOAD_FLAG = 'brika-bootstrap-sw-reloaded';

/**
 * Register the SW that intercepts every cached same-origin GET. Returns
 * true once a service worker is controlling this page (or false if SWs
 * aren't available, were blocked, or simply didn't take over in time —
 * old browsers, private mode, DevTools "Bypass for network", policy).
 *
 * Auto-recovers from a stale SW carried over from a previous bootstrap
 * deploy:
 *
 *   1. `updateViaCache: 'none'` refetches `/sw.js` every register call
 *      instead of trusting HTTP cache (defaults can keep the old SW
 *      alive for up to 24h).
 *   2. Listen for `updatefound` BEFORE calling `reg.update()` so we
 *      reliably detect a new SW being installed.
 *   3. On detection, wait for `controllerchange` (the new SW's install
 *      handler calls `skipWaiting()`; activate calls `clients.claim()`).
 *   4. Finally ping the SW's sentinel endpoint to verify we're talking
 *      to the version the bootstrap expects. On mismatch, reload once
 *      (sessionStorage flag prevents a loop).
 *
 * Soft-failure throughout: this never throws to its caller. If anything
 * goes wrong we return whatever state we can — the bootstrap downstream
 * will fail more diagnostically when it tries to load a real module.
 */
export async function ensureServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    const arriving = detectArrivingSw(reg);
    reg.update().catch(() => {
      /* network failure on update check shouldn't abort the bootstrap */
    });

    // If a new SW is parked in "waiting" because skipWaiting() didn't
    // propagate at install time, nudge it via postMessage.
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) {
        return;
      }
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    if ((await arriving) || !navigator.serviceWorker.controller) {
      // Be generous — on slow networks the install can take 10+s.
      await waitForControllerChange(15_000).catch(() => {
        /* SW activation timed out: fall through to controller check */
      });
    }

    if (!navigator.serviceWorker.controller) {
      // No controller after our wait. DevTools "Bypass for network",
      // private mode, or a policy-restricted environment.
      return false;
    }

    // Verify we have an up-to-date SW. If the controller is stale (old
    // version that doesn't know our sentinel), unregister + reload to
    // pick up the fresh worker. Use a counter so we try up to 2 reloads
    // before giving up — first reload covers most cases, second covers
    // edge cases where the browser cached the SW more aggressively.
    if (await isStaleController()) {
      const attempts = Number(sessionStorage.getItem(RELOAD_FLAG) ?? '0');
      if (attempts >= 2) {
        // Tried twice already, still stale. Stop reloading and let the
        // caller surface a specific error (with a manual "Reset" CTA).
        return false;
      }
      // Order matters: bump the counter AFTER the soft-reset so the
      // counter survives the reload. softResetForRecovery deliberately
      // leaves sessionStorage alone; if we called the public
      // clearBootstrapState() here it would wipe the counter and we'd
      // loop forever.
      await softResetForRecovery();
      sessionStorage.setItem(RELOAD_FLAG, String(attempts + 1));
      globalThis.location.reload();
      // Page is about to navigate; never resolve.
      await new Promise<void>(() => {
        /* unreachable */
      });
    } else {
      sessionStorage.removeItem(RELOAD_FLAG);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Unregister every SW + drop every `brika-*` cache. Used internally
 * by the auto-recovery path. Does NOT clear sessionStorage so the
 * outer retry counter survives the reload.
 */
async function softResetForRecovery(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* best effort */
  }
  try {
    if ('caches' in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('brika-')).map((n) => caches.delete(n)));
    }
  } catch {
    /* best effort */
  }
}

/**
 * Hard reset for the user-initiated "Reset and reload" button on the
 * error card: unregister every SW, drop every cache, AND clear the
 * retry counter so the next bootstrap attempt starts fresh.
 */
export async function clearBootstrapState(): Promise<void> {
  await softResetForRecovery();
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* private mode storage block */
  }
}

/**
 * Resolve `true` if a new SW is (or starts) installing within the
 * detection window, `false` otherwise. Race-free: the `updatefound`
 * listener is attached BEFORE we trigger `reg.update()`.
 */
function detectArrivingSw(reg: ServiceWorkerRegistration, windowMs = 2_000): Promise<boolean> {
  if (reg.installing || reg.waiting) {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    const onUpdate = (): void => {
      reg.removeEventListener('updatefound', onUpdate);
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      reg.removeEventListener('updatefound', onUpdate);
      resolve(false);
    }, windowMs);
    reg.addEventListener('updatefound', onUpdate);
  });
}

function waitForControllerChange(timeoutMs = 8_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SW activation timed out')), timeoutMs);
    const handler = (): void => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', handler);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handler);
  });
}

/**
 * Returns true if the current SW controller doesn't respond with our
 * expected version on the sentinel path. Old SWs that only intercepted
 * `/assets/*` fall through to the network here, which returns the CF
 * Worker SPA-fallback HTML — never matches the version string.
 */
async function isStaleController(): Promise<boolean> {
  try {
    const res = await fetch(SW_PING_PATH, { cache: 'no-store' });
    if (!res.ok) {
      return true;
    }
    const version = (await res.text()).trim();
    return version !== EXPECTED_SW_VERSION;
  } catch {
    return true;
  }
}
