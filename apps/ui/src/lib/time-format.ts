/**
 * User-level preference for how times are rendered across the app.
 *
 * - `auto` defers to the active i18n locale (fr → 24h, en-US → 12h, …).
 * - `h12` / `h24` force a specific clock regardless of locale.
 *
 * Persisted in localStorage; changes propagate to other tabs via the storage
 * event and to the same tab via a custom event so `useSyncExternalStore`
 * components re-render immediately.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type TimeFormat = 'auto' | 'h12' | 'h24';

const STORAGE_KEY = 'brika.timeFormat';
const CHANGE_EVENT = 'brika.timeFormatChange';
const DEFAULT: TimeFormat = 'auto';

function isTimeFormat(value: unknown): value is TimeFormat {
  return value === 'auto' || value === 'h12' || value === 'h24';
}

function read(): TimeFormat {
  if (globalThis.window === undefined) {
    return DEFAULT;
  }
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  return isTimeFormat(stored) ? stored : DEFAULT;
}

function subscribe(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      callback();
    }
  };
  globalThis.addEventListener('storage', onStorage);
  globalThis.addEventListener(CHANGE_EVENT, callback);
  return () => {
    globalThis.removeEventListener('storage', onStorage);
    globalThis.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useTimeFormat() {
  const preference = useSyncExternalStore(subscribe, read, () => DEFAULT);

  const setPreference = useCallback((value: TimeFormat) => {
    globalThis.localStorage.setItem(STORAGE_KEY, value);
    globalThis.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const hour12: boolean | undefined = preference === 'auto' ? undefined : preference === 'h12';

  return { preference, setPreference, hour12 };
}
