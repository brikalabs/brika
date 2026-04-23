/**
 * Custom theme persistence (localStorage).
 * Keeps custom themes out of the React tree so the runtime layer
 * can read them synchronously during theme-provider bootstrap.
 */

import { migrateThemeConfig } from './migrate';
import type { ThemeConfig } from './types';
import { THEME_CONFIG_VERSION } from './types';

const STORAGE_KEY = 'brika-custom-themes';
const LISTENERS = new Set<() => void>();

/**
 * Cached snapshot. Reference stability matters: useSyncExternalStore
 * re-renders if `getSnapshot()` returns a new reference, so a naive
 * implementation that parses JSON on every call yields an infinite
 * render loop. We parse once lazily and invalidate only on mutations.
 */
let snapshot: ThemeConfig[] | null = null;

function notify() {
  for (const cb of LISTENERS) {
    cb();
  }
}

function parseFromStorage(): ThemeConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

function getSnapshot(): ThemeConfig[] {
  snapshot ??= parseFromStorage();
  return snapshot;
}

function write(themes: ThemeConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  snapshot = themes;
  notify();
}

export const customThemeStorage = {
  list(): ThemeConfig[] {
    return getSnapshot();
  },

  get(id: string): ThemeConfig | undefined {
    return getSnapshot().find((t) => t.id === id);
  },

  save(theme: ThemeConfig): void {
    const all = getSnapshot();
    const idx = all.findIndex((t) => t.id === theme.id);
    const next = { ...theme, updatedAt: Date.now() };
    const copy = idx >= 0 ? all.map((t, i) => (i === idx ? next : t)) : [...all, next];
    write(copy);
  },

  remove(id: string): void {
    write(getSnapshot().filter((t) => t.id !== id));
  },

  subscribe(listener: () => void): () => void {
    LISTENERS.add(listener);
    return () => {
      LISTENERS.delete(listener);
    };
  },
};
