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
      return {
        close: () => {
          callbacks.delete(dir);
        },
      } as fsModule.FSWatcher;
    };
    // spyOn doesn't type `watch` properly due to overloads — cast the method name
    this.#spy = spyOn(fsModule, 'watch' as 'writeFileSync').mockImplementation(
      impl as unknown as () => void
    );
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
