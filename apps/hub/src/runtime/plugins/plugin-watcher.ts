/**
 * Watches plugin source directories for changes and triggers hot-reload.
 *
 * Uses Node's fs.watch with per-plugin debounce (same pattern as
 * WorkflowLoader / BoardLoader). On any TS/TSX/CSS change inside a
 * plugin's `src/` directory, the plugin is automatically reloaded.
 */

import { type FSWatcher, watch } from 'node:fs';
import { join } from 'node:path';
import { inject, singleton } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';

const DEBOUNCE_MS = 500;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function isSourceFile(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  return dot !== -1 && SOURCE_EXTENSIONS.has(filename.slice(dot));
}

@singleton()
export class PluginWatcher {
  readonly #logs = inject(Logger).withSource('plugin');
  readonly #watchers = new Map<string, FSWatcher>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #onReload: ((pluginName: string) => void) | null = null;

  /** Set the callback invoked when a plugin's sources change. */
  setReloadHandler(handler: (pluginName: string) => void): void {
    this.#onReload = handler;
  }

  /** Start watching a plugin's `src/` directory for source changes. */
  watch(pluginName: string, rootDirectory: string): void {
    // Idempotent — unwatch first if already watching
    this.unwatch(pluginName);

    const srcDir = join(rootDirectory, 'src');

    try {
      const watcher = watch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) {
          return;
        }
        const name = String(filename);
        if (isSourceFile(name)) {
          this.#scheduleReload(pluginName);
        }
      });

      this.#watchers.set(pluginName, watcher);
      this.#logs.debug('Watching plugin sources', { pluginName, directory: srcDir });
    } catch {
      // src/ directory may not exist (e.g., pre-built plugins)
      this.#logs.debug('Cannot watch plugin sources (directory may not exist)', {
        pluginName,
        directory: srcDir,
      });
    }
  }

  /** Stop watching a plugin and cancel any pending reload. */
  unwatch(pluginName: string): void {
    const watcher = this.#watchers.get(pluginName);
    if (watcher) {
      watcher.close();
      this.#watchers.delete(pluginName);
    }

    const timer = this.#timers.get(pluginName);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(pluginName);
    }
  }

  /** Stop all watchers and pending timers. */
  stopAll(): void {
    for (const name of [...this.#watchers.keys()]) {
      this.unwatch(name);
    }
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
