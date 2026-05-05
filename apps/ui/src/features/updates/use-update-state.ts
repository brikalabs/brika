/**
 * Client-side persistence for the update notification surfaces.
 *
 *   useDismissedVersion — tracks the most recent version the user has snoozed
 *     via the toast / rail "dismiss" action. The toast and rail stay hidden
 *     for that exact version; a newer version brings them back.
 *
 *   useLastSeenVersion — tracks the version whose release notes the user has
 *     already viewed in the auto-opened "What's new" sheet. When `health.version`
 *     differs from the stored value, the sheet auto-opens once.
 */

import { useCallback, useEffect, useState } from 'react';

const DISMISSED_KEY = 'brika.update.dismissedVersion';
const LAST_SEEN_KEY = 'brika.update.lastSeenVersion';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage may be disabled (private mode, quota) — fail silently.
  }
}

/**
 * Read + write the per-version dismissal flag.
 * Returns `dismissed: true` only when the *exact* version matches the stored
 * value, so a newer release re-shows the surfaces automatically.
 */
export function useDismissedVersion(currentTargetVersion: string | undefined) {
  const [dismissed, setDismissed] = useState<string | null>(() => readStorage(DISMISSED_KEY));

  // Re-read when the target version changes (covers cross-tab updates too)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === DISMISSED_KEY) {
        setDismissed(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const dismiss = useCallback(() => {
    if (!currentTargetVersion) {
      return;
    }
    writeStorage(DISMISSED_KEY, currentTargetVersion);
    setDismissed(currentTargetVersion);
  }, [currentTargetVersion]);

  const reset = useCallback(() => {
    writeStorage(DISMISSED_KEY, null);
    setDismissed(null);
  }, []);

  const isDismissed = !!currentTargetVersion && dismissed === currentTargetVersion;

  return { isDismissed, dismiss, reset };
}

/**
 * Track which version the user has already seen the "What's new" sheet for.
 * `shouldShow` is true when `runningVersion` differs from the stored value AND
 * a stored value exists (we don't pop it on first install).
 */
export function useLastSeenVersion(runningVersion: string | undefined) {
  const [lastSeen, setLastSeen] = useState<string | null>(() => readStorage(LAST_SEEN_KEY));

  const markSeen = useCallback((version: string) => {
    writeStorage(LAST_SEEN_KEY, version);
    setLastSeen(version);
  }, []);

  const shouldShow = !!runningVersion && lastSeen !== null && lastSeen !== runningVersion;
  const isFirstRun = lastSeen === null;

  return { lastSeen, shouldShow, isFirstRun, markSeen };
}
