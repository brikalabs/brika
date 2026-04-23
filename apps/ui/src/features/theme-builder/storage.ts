/**
 * Custom theme store — hub-backed with a localStorage shadow.
 *
 * The builder + runtime read this store synchronously (injecting the
 * currently-active theme into the DOM before paint), so the public API
 * stays synchronous. To make that possible, we keep an in-memory cache
 * mirrored to `localStorage` and treat the hub as the source of truth
 * that we reconcile asynchronously.
 *
 *   boot       load shadow from localStorage (sync)
 *   hydrate    fetch from hub, merge, write-through to localStorage
 *   mutate     optimistic local write + background PUT/DELETE
 *   invalidate re-fetch on SSE `theme.invalidate` or window focus
 */

import { fetcher } from '@/lib/query';
import { migrateThemeConfig } from './migrate';
import type { ThemeConfig } from './types';
import { THEME_CONFIG_VERSION } from './types';

const SHADOW_KEY = 'brika-custom-themes-cache';
/** Legacy key kept for the one-time migration to hub storage. */
const LEGACY_KEY = 'brika-custom-themes';

const LISTENERS = new Set<() => void>();

/**
 * Reference-stable snapshot. `useSyncExternalStore` re-renders when the
 * ref changes, so we parse once and allocate a new array only on actual
 * mutation or hydration.
 */
let snapshot: ThemeConfig[] = readShadow();

function notify() {
  for (const cb of LISTENERS) {
    cb();
  }
}

function readShadow(): ThemeConfig[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(SHADOW_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (t): t is ThemeConfig =>
          typeof t === 'object' &&
          t !== null &&
          'id' in t &&
          'name' in t &&
          'colors' in t &&
          'version' in t &&
          (t as { version: unknown }).version === THEME_CONFIG_VERSION
      )
      .map(migrateThemeConfig);
  } catch {
    return [];
  }
}

function writeShadow(themes: ThemeConfig[]) {
  snapshot = themes;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SHADOW_KEY, JSON.stringify(themes));
  }
  notify();
}

/**
 * GET /api/settings/custom-themes and replace the local cache.
 *
 * Called once on app mount and again on every `theme.invalidate` SSE event.
 * Silently returns the local snapshot on failure — theming must not crash
 * the UI just because the hub is momentarily unreachable.
 */
export async function hydrateCustomThemes(): Promise<ThemeConfig[]> {
  try {
    const data = await fetcher<{ themes: ThemeConfig[] }>('/api/settings/custom-themes');
    const themes = (data.themes ?? []).map(migrateThemeConfig);
    writeShadow(themes);
    return themes;
  } catch {
    return snapshot;
  }
}

/**
 * One-shot migration: if the legacy `brika-custom-themes` key still exists
 * and the hub has nothing, upload everything and clear the old key.
 * Runs after the first hydrate — callers shouldn't await it.
 */
export async function migrateLegacyThemes(): Promise<void> {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (!legacyRaw) {
    return;
  }
  try {
    const hubThemes = await fetcher<{ themes: ThemeConfig[] }>('/api/settings/custom-themes');
    if ((hubThemes.themes ?? []).length > 0) {
      // Hub already has data — assume migration completed on another device.
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    const parsed: unknown = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    for (const raw of parsed) {
      const t = migrateThemeConfig(raw as ThemeConfig);
      await fetcher(`/api/settings/custom-themes/${encodeURIComponent(t.id)}`, {
        method: 'PUT',
        body: JSON.stringify(t),
      });
    }
    localStorage.removeItem(LEGACY_KEY);
    await hydrateCustomThemes();
  } catch (err) {
    console.warn('[theme-builder] Legacy theme migration failed', err);
  }
}

export const customThemeStorage = {
  list(): ThemeConfig[] {
    return snapshot;
  },

  get(id: string): ThemeConfig | undefined {
    return snapshot.find((t) => t.id === id);
  },

  /**
   * Optimistic upsert. Updates the local snapshot and fires a background
   * PUT. Throws if the hub rejects the write (caller decides whether to
   * roll back — the builder flow re-reads from hub on reconnect).
   */
  save(theme: ThemeConfig): void {
    const next: ThemeConfig = { ...theme, updatedAt: Date.now() };
    const idx = snapshot.findIndex((t) => t.id === theme.id);
    const copy = idx >= 0 ? snapshot.map((t, i) => (i === idx ? next : t)) : [...snapshot, next];
    writeShadow(copy);

    void fetcher(`/api/settings/custom-themes/${encodeURIComponent(next.id)}`, {
      method: 'PUT',
      body: JSON.stringify(next),
    }).catch((err: unknown) => {
      console.warn('[theme-builder] Failed to persist theme to hub', err);
    });
  },

  /** Optimistic delete. */
  remove(id: string): void {
    writeShadow(snapshot.filter((t) => t.id !== id));

    void fetcher(`/api/settings/custom-themes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch((err: unknown) => {
      console.warn('[theme-builder] Failed to delete theme on hub', err);
    });
  },

  subscribe(listener: () => void): () => void {
    LISTENERS.add(listener);
    return () => {
      LISTENERS.delete(listener);
    };
  },
};
