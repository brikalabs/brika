/**
 * Persistent hub-name storage for the bootstrap.
 *
 * The hub a given browser is bound to is a user preference, not a URL
 * coordinate. Storing it in `localStorage` (rather than encoding it in
 * the path as `hub.brika.dev/<name>/...`) keeps every URL clean —
 * `/plugins`, `/boards/x`, the works — and lets the loaded hub UI use
 * the path freely for its own routes without colliding with the
 * bootstrap's hub-name parser.
 *
 * `localStorage` rather than `sessionStorage`: the user's intent ("I
 * own hub X") survives tab closes. To switch hubs the user explicitly
 * clears via {@link clearHubName} (wired to a UI affordance).
 *
 * `?hub=<name>` in the URL takes precedence on read — it's the one
 * non-persistent override path, used for shared links and migrations.
 */

import { isValidHubName } from './hub-name';

const STORAGE_KEY = 'brika.bootstrap.hubName';
const QUERY_PARAM = 'hub';
const META_NAME = 'brika:hub';

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-mode browsers reject localStorage access.
    return null;
  }
}

function writeStorage(value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    /* nothing — see readStorage */
  }
}

/**
 * Resolve the hub the bootstrap should connect to. Priority order:
 *
 *   1. `<meta name="brika:hub" content=...>` stamped by the coordinator
 *      Worker — present whenever the URL resolves server-side to a hub
 *      (the canonical production path form `hub.brika.dev/<name>` and
 *      the dev `localhost:5174/<name>` shape both end up here). MUST
 *      win over localStorage so navigating to a different hub via the
 *      URL bar isn't silently rewritten to whatever the user last
 *      opened.
 *   2. `?hub=<name>` URL override.
 *   3. localStorage value (the persisted "default" hub for this browser).
 *   4. `null` — the bootstrap shows the landing screen.
 *
 * Pure read — does NOT persist.
 */
export function loadHubName(): string | null {
  const fromMeta = readMetaHub();
  if (fromMeta) {
    return fromMeta;
  }
  const fromQuery = readQueryHub();
  if (fromQuery) {
    return fromQuery;
  }
  const stored = readStorage();
  return stored && isValidHubName(stored) ? stored : null;
}

/**
 * Best-effort guess of what hub name to pre-fill into the landing
 * input. Returns the `?hub=<name>` query value or the first path
 * segment if it looks like a valid hub name (legacy URL migration:
 * `hub.brika.dev/maxime` users land on the landing screen with
 * "maxime" already typed in).
 */
export function suggestHubName(): string | null {
  const fromQuery = readQueryHub();
  if (fromQuery) {
    return fromQuery;
  }
  if (globalThis.location === undefined) {
    return null;
  }
  const first = globalThis.location.pathname.split('/').find((s) => s.length > 0);
  return first && isValidHubName(first) ? first : null;
}

/**
 * Store the bound hub name. If the prior name differs, wipe every
 * `brika-*` cache so the next page load fetches a fresh asset graph
 * from the new hub. Returns a promise that resolves when the purge
 * (if any) has actually completed — callers MUST await before
 * navigating, otherwise the cache may still serve the prior hub's
 * bytes on the next request.
 */
export async function storeHubName(name: string): Promise<void> {
  if (!isValidHubName(name)) {
    return;
  }
  const prior = readStorage();
  writeStorage(name);
  if (prior && prior !== name) {
    await purgeAssetCaches();
  }
}

export async function clearHubName(): Promise<void> {
  const prior = readStorage();
  writeStorage(null);
  if (prior) {
    await purgeAssetCaches();
  }
}

async function purgeAssetCaches(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('brika-')).map((n) => caches.delete(n)));
  } catch {
    /* cache API unavailable (private mode, policy) — best effort */
  }
}

function readQueryHub(): string | null {
  if (globalThis.location === undefined) {
    return null;
  }
  try {
    const value = new URL(globalThis.location.href).searchParams.get(QUERY_PARAM);
    return value && isValidHubName(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Read the coordinator-stamped meta tag. The Worker writes
 * `<meta name="brika:hub" content=...>` for every URL it recognises
 * as a hub address (path-based `/<name>`, query-based `/?hub=<name>`),
 * so trusting this tag is equivalent to trusting the Worker's
 * authoritative URL→hub resolution — which is the only place that
 * can authoritatively say "this URL means hub X".
 */
function readMetaHub(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const value = document.querySelector(`meta[name="${META_NAME}"]`)?.getAttribute('content');
  return value && isValidHubName(value) ? value : null;
}
