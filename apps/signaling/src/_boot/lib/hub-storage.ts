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
 *   1. `?hub=<name>` URL override (one-shot, also persisted so future
 *      reloads on the same browser stick).
 *   2. localStorage value.
 *   3. `null` — the bootstrap shows the landing screen.
 *
 * Pure read — does NOT persist. Use {@link commitQueryHub} to persist
 * a `?hub=` override after the page has mounted; doing it inside the
 * pure read would silently drop the cache-purge promise on rebind.
 */
export function loadHubName(): string | null {
  const fromQuery = readQueryHub();
  if (fromQuery) {
    return fromQuery;
  }
  const stored = readStorage();
  return stored && isValidHubName(stored) ? stored : null;
}

/**
 * Persist a `?hub=` override into localStorage and (when the prior bound
 * hub differs) purge `brika-*` caches. Call once at mount from an effect;
 * await the returned promise before the bootstrap connects so a hostile
 * rebind cannot continue serving the prior hub's cached modules.
 */
export async function commitQueryHub(): Promise<void> {
  const fromQuery = readQueryHub();
  if (fromQuery) {
    await storeHubName(fromQuery);
  }
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
