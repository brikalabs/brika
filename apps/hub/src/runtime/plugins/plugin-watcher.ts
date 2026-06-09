/**
 * Watches plugin source directories for changes and triggers hot-reload.
 *
 * Uses Node's fs.watch with per-plugin debounce (same pattern as
 * WorkflowLoader / BoardLoader). On any TS/TSX/CSS change inside a
 * plugin's `src/` directory, the plugin is automatically reloaded.
 *
 * fs.watch is the fast path. On macOS it can silently stop delivering
 * events after a while (the FSEvents stream dies but no 'error' fires),
 * so source edits stop triggering reloads. To stay robust, each plugin
 * also gets a periodic mtime-snapshot poller that fires the same
 * debounced reload when any source file's mtime changes, or a file is
 * added or removed. The poller is the safety net, fs.watch keeps the
 * common case fast.
 */

import { type Dirent, type FSWatcher, readdirSync, type Stats, statSync, watch } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, singleton } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';

const DEBOUNCE_MS = 500;
const POLL_INTERVAL_MS = 1500;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function isSourceFile(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  return dot !== -1 && SOURCE_EXTENSIONS.has(filename.slice(dot));
}

/** Per-plugin bookkeeping for the fs.watch + poller pair. */
interface WatchEntry {
  /** The watched `src/` directory. */
  readonly srcDir: string;
  /** The active fs.watch handle, or null if it could not be (re)armed. */
  watcher: FSWatcher | null;
  /** The poll interval handle. */
  poller: ReturnType<typeof setInterval>;
  /** Snapshot of source-file paths to their last-seen mtime (ms). */
  snapshot: Map<string, number>;
  /** Guards against overlapping poll scans. */
  polling: boolean;
}

@singleton()
export class PluginWatcher {
  readonly #logs = inject(Logger).withSource('plugin');
  readonly #entries = new Map<string, WatchEntry>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #onReload: ((pluginName: string) => void) | null = null;

  /** Set the callback invoked when a plugin's sources change. */
  setReloadHandler(handler: (pluginName: string) => void): void {
    this.#onReload = handler;
  }

  /** Start watching a plugin's `src/` directory for source changes. */
  watch(pluginName: string, rootDirectory: string): void {
    // Idempotent: unwatch first if already watching
    this.unwatch(pluginName);

    const srcDir = join(rootDirectory, 'src');

    // The src/ directory may not exist (e.g., pre-built plugins). Probe it
    // once: if it is unreadable there is nothing to watch or poll.
    if (!this.#directoryExists(srcDir)) {
      this.#logs.debug('Cannot watch plugin sources (directory may not exist)', {
        pluginName,
        directory: srcDir,
      });
      return;
    }

    const entry: WatchEntry = {
      srcDir,
      watcher: null,
      poller: setInterval(() => {
        void this.#poll(pluginName);
      }, POLL_INTERVAL_MS),
      snapshot: this.#scanSnapshotSync(srcDir),
      polling: false,
    };
    this.#entries.set(pluginName, entry);
    this.#armWatcher(pluginName, entry);

    this.#logs.debug('Watching plugin sources', { pluginName, directory: srcDir });
  }

  /** Stop watching a plugin and cancel any pending reload. */
  unwatch(pluginName: string): void {
    const entry = this.#entries.get(pluginName);
    if (entry) {
      entry.watcher?.close();
      clearInterval(entry.poller);
      this.#entries.delete(pluginName);
    }

    const timer = this.#timers.get(pluginName);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(pluginName);
    }
  }

  /** Stop all watchers, pollers, and pending timers. */
  stopAll(): void {
    for (const name of this.#entries.keys()) {
      this.unwatch(name);
    }
  }

  /**
   * (Re)arm the fast-path fs.watch for a plugin. Any 'error' event (which
   * macOS may emit when the FSEvents stream collapses) re-arms the watcher
   * so the fast path can recover without waiting on the poller.
   */
  #armWatcher(pluginName: string, entry: WatchEntry): void {
    try {
      const watcher = watch(entry.srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) {
          return;
        }
        if (isSourceFile(String(filename))) {
          this.#scheduleReload(pluginName);
        }
      });

      watcher.on('error', (error) => {
        this.#logs.debug('fs.watch error, re-arming watcher', {
          pluginName,
          error: error instanceof Error ? error.message : String(error),
        });
        // Only re-arm if this plugin is still being watched and this is its
        // current watcher (avoid resurrecting a closed/replaced handle).
        const current = this.#entries.get(pluginName);
        if (current === entry) {
          entry.watcher?.close();
          entry.watcher = null;
          this.#armWatcher(pluginName, entry);
        }
      });

      entry.watcher = watcher;
    } catch (error) {
      // fs.watch failed to arm: the poller remains as the safety net.
      entry.watcher = null;
      this.#logs.debug('Cannot arm fs.watch (poller fallback active)', {
        pluginName,
        directory: entry.srcDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Poll the watched directory, comparing source-file mtimes against the
   * stored snapshot. Fires a debounced reload when any source file changes,
   * is added, or is removed. This is the safety net for a dead fs.watch.
   */
  async #poll(pluginName: string): Promise<void> {
    const entry = this.#entries.get(pluginName);
    if (!entry || entry.polling) {
      return;
    }
    entry.polling = true;
    try {
      const next = await this.#scanSnapshot(entry.srcDir);
      if (this.#snapshotChanged(entry.snapshot, next)) {
        entry.snapshot = next;
        this.#scheduleReload(pluginName);
      } else {
        entry.snapshot = next;
      }
    } catch (error) {
      this.#logs.debug('Poll scan failed', {
        pluginName,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      entry.polling = false;
    }
  }

  /** True when the set of source files, or any of their mtimes, differs. */
  #snapshotChanged(previous: Map<string, number>, next: Map<string, number>): boolean {
    if (previous.size !== next.size) {
      return true;
    }
    for (const [path, mtime] of next) {
      const before = previous.get(path);
      if (before === undefined || before !== mtime) {
        return true;
      }
    }
    return false;
  }

  /** Recursively collect source-file mtimes under a directory (async). */
  async #scanSnapshot(directory: string): Promise<Map<string, number>> {
    const snapshot = new Map<string, number>();
    const walk = async (dir: string): Promise<void> => {
      const dirents = await readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        const full = join(dir, dirent.name);
        if (dirent.isDirectory()) {
          await walk(full);
        } else if (dirent.isFile() && isSourceFile(dirent.name)) {
          const stats = await stat(full);
          snapshot.set(full, stats.mtimeMs);
        }
      }
    };
    await walk(directory);
    return snapshot;
  }

  /**
   * Synchronous snapshot taken at watch() time so the very first poll has a
   * baseline to compare against (avoids a spurious reload on first tick).
   */
  #scanSnapshotSync(directory: string): Map<string, number> {
    const snapshot = new Map<string, number>();
    const walk = (dir: string): void => {
      let dirents: Dirent[];
      try {
        dirents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const dirent of dirents) {
        const full = join(dir, dirent.name);
        if (dirent.isDirectory()) {
          walk(full);
        } else if (dirent.isFile() && isSourceFile(dirent.name)) {
          const stats = this.#statSafe(full);
          if (stats) {
            snapshot.set(full, stats.mtimeMs);
          }
        }
      }
    };
    walk(directory);
    return snapshot;
  }

  #statSafe(path: string): Stats | null {
    try {
      return statSync(path);
    } catch {
      return null;
    }
  }

  #directoryExists(path: string): boolean {
    const stats = this.#statSafe(path);
    return stats !== null && stats.isDirectory();
  }

  #scheduleReload(pluginName: string): void {
    const existing = this.#timers.get(pluginName);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.#timers.delete(pluginName);
      this.#logs.info('Source change detected, reloading plugin', { pluginName });
      this.#onReload?.(pluginName);
    }, DEBOUNCE_MS);

    this.#timers.set(pluginName, timer);
  }
}
