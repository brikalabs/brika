/**
 * Singleton ring buffer for debug entries plus the console / error
 * capture hooks. Lives outside React so:
 *
 *   - entries logged during module init (before any provider mounts)
 *     aren't lost,
 *   - StrictMode's double-mount can't install console patches twice,
 *   - multiple providers in the same process still see one log stream.
 *
 * The provider subscribes via `subscribe()`; it stays cheap because we
 * only re-render when a new entry lands.
 */

import { formatArgs, formatValue } from './format';
import type { DebugEntry, DebugLevel } from './types';

const DEFAULT_CAPACITY = 500;

interface ConsoleSnapshot {
  readonly log: typeof console.log;
  readonly info: typeof console.info;
  readonly warn: typeof console.warn;
  readonly error: typeof console.error;
  readonly debug: typeof console.debug;
}

class DebugBuffer {
  private entries: DebugEntry[] = [];
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  private capacity = DEFAULT_CAPACITY;
  private installed = false;
  private original: ConsoleSnapshot | null = null;
  private onUncaught?: (err: unknown) => void;
  private onUnhandled?: (reason: unknown) => void;

  setCapacity(n: number): void {
    this.capacity = Math.max(10, n);
    this.trim();
  }

  getEntries(): ReadonlyArray<DebugEntry> {
    return this.entries;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  push(level: DebugLevel, text: string, source: string = 'app'): void {
    const entry: DebugEntry = {
      id: this.nextId++,
      level,
      text,
      timestamp: Date.now(),
      source,
    };
    this.entries.push(entry);
    this.trim();
    this.emit();
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  /** Install console + error hooks. Idempotent: safe to call from
   *  StrictMode double-mount or multiple providers. */
  install(): void {
    if (this.installed) {
      return;
    }
    this.installed = true;
    this.original = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      // biome-ignore lint/suspicious/noConsole: this buffer is the runtime sink for console.*; capturing the originals is the point
      debug: console.debug,
    };
    const wrap = (level: DebugLevel, original: (...args: unknown[]) => void) => {
      return (...args: unknown[]): void => {
        this.push(level, formatArgs(args), 'console');
        // We deliberately do NOT forward to the original — writing to
        // stdout while Ink owns the screen corrupts the render. The
        // debug overlay is now the single sink. Apps that need to keep
        // a side-channel log can subscribe via `useDebug()`.
        void original;
      };
    };
    console.log = wrap('log', this.original.log);
    console.info = wrap('info', this.original.info);
    console.warn = wrap('warn', this.original.warn);
    console.error = wrap('error', this.original.error);
    console.debug = wrap('debug', this.original.debug);

    this.onUncaught = (err: unknown): void => {
      this.push('error', formatValue(err), 'uncaughtException');
    };
    this.onUnhandled = (reason: unknown): void => {
      this.push('error', formatValue(reason), 'unhandledRejection');
    };
    process.on('uncaughtException', this.onUncaught);
    process.on('unhandledRejection', this.onUnhandled);
  }

  /** Restore the original console + error hooks. Mostly used in tests
   *  — apps generally install once and leave it. */
  uninstall(): void {
    if (!this.installed || !this.original) {
      return;
    }
    console.log = this.original.log;
    console.info = this.original.info;
    console.warn = this.original.warn;
    console.error = this.original.error;
    console.debug = this.original.debug;
    if (this.onUncaught) {
      process.off('uncaughtException', this.onUncaught);
    }
    if (this.onUnhandled) {
      process.off('unhandledRejection', this.onUnhandled);
    }
    this.installed = false;
    this.original = null;
    this.onUncaught = undefined;
    this.onUnhandled = undefined;
  }

  private trim(): void {
    if (this.entries.length <= this.capacity) {
      return;
    }
    this.entries = this.entries.slice(this.entries.length - this.capacity);
  }

  private emit(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}

export const debugBuffer = new DebugBuffer();
