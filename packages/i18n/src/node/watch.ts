/**
 * File-system watcher tuned for translation reload flows. Wraps
 * `node:fs/watch` with `.json` filtering and burst debouncing so callers
 * receive a single `onReload` call per editing session, not one per keystroke.
 *
 * Works in Node and Bun. Used by the hub for live-reload of locale JSON
 * edits; standalone CLIs and plugin authors can use it too.
 */

import { watch as fsWatch } from 'node:fs';

export interface WatchOptions {
  /** Directory to watch (recursive). */
  readonly path: string;
  /**
   * Called after the burst settles. Receives the deduplicated set of relative
   * paths that changed in the debounce window — lets callers do granular
   * reloads (just the affected namespaces) instead of a full rescan.
   *
   * May be sync or async; failures aren't retried.
   */
  readonly onReload: (changedFiles: readonly string[]) => Promise<void> | void;
  /** Debounce window in milliseconds. Default 300. */
  readonly debounceMs?: number;
  /** File-name filter; defaults to `*.json`. Receives the basename. */
  readonly filter?: (filename: string) => boolean;
  /** Called with the underlying watcher error (e.g. EACCES). Default: silently swallow. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Begin watching. The returned function stops the watcher and cancels any
 * pending reload timer.
 *
 * Filenames changed during the debounce window are coalesced into a
 * deduplicated array and passed to `onReload` in one call.
 */
export function watchLocaleSource(options: WatchOptions): () => void {
  const debounceMs = options.debounceMs ?? 300;
  const filter = options.filter ?? defaultFilter;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const pending = new Set<string>();

  let watcher: ReturnType<typeof fsWatch> | null = null;
  try {
    watcher = fsWatch(options.path, { recursive: true }, (_event, filename) => {
      if (cancelled || !filename) {
        return;
      }
      const name = String(filename);
      if (!filter(name)) {
        return;
      }
      pending.add(name);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        const changed = [...pending];
        pending.clear();
        // Don't await: long-running reloads should not block the watcher loop.
        // Errors inside the reload are the caller's responsibility.
        Promise.resolve(options.onReload(changed)).catch((e) => {
          options.onError?.(e);
        });
      }, debounceMs);
    });
    watcher.on('error', (e) => options.onError?.(e));
  } catch (e) {
    // Path may not exist (e.g. running from a packaged binary).
    options.onError?.(e);
  }

  return () => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending.clear();
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // already closed
      }
      watcher = null;
    }
  };
}

function defaultFilter(filename: string): boolean {
  return filename.endsWith('.json');
}
