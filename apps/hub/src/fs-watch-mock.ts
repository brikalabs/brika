/**
 * Mock helper for fs.watch in tests
 *
 * Allows tests to simulate file system watch events without relying on actual file I/O.
 */
import { spyOn } from 'bun:test';
import * as fsModule from 'node:fs';

type WatchCallback = (event: string, filename: string | Buffer | null) => void;

export class FsWatchMock {
  readonly #callbacks = new Map<string, WatchCallback>();
  #spy: ReturnType<typeof spyOn> | null = null;

  /**
   * Apply the mock to fs.watch
   */
  apply(): void {
    const callbacks = this.#callbacks;
    const impl = (dir: string, _options: unknown, callback?: WatchCallback): fsModule.FSWatcher => {
      if (callback) {
        callbacks.set(dir, callback);
      }
      // @ts-expect-error — FSWatcher has many methods we don't need; tests only call close().
      return {
        close: () => {
          callbacks.delete(dir);
        },
      };
    };
    // @ts-expect-error — bun:test's spyOn can't narrow fs.watch's overloads to our impl.
    this.#spy = spyOn(fsModule, 'watch').mockImplementation(impl);
  }

  /**
   * Restore original fs.watch
   */
  restore(): void {
    if (this.#spy) {
      this.#spy.mockRestore?.();
      this.#spy = null;
    }
    this.#callbacks.clear();
  }

  /**
   * Simulate a file change event
   */
  simulateChange(dir: string, filename: string | null): void {
    const callback = this.#callbacks.get(dir);
    if (callback) {
      callback('change', filename);
    }
  }
}
