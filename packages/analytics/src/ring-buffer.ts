/**
 * Bounded queue for the in-memory event ring on `Analytics.recent()`.
 *
 * Implementation: a plain `Array` with `push`/`shift` once we exceed capacity.
 * For the analytics workload (~1k cap, infrequent push relative to bursty
 * SQLite inserts) the constant-factor cost of `Array.shift` is irrelevant
 * against the larger fan-out work in `Analytics.emit`. We deliberately use a
 * different layout from the hub's circular-buffer implementation so the two
 * stay independent — analytics has no need to import hub internals.
 */
export class RingBuffer<T> {
  readonly #items: T[] = [];
  readonly #limit: number;

  constructor(capacity: number) {
    this.#limit = capacity;
  }

  push(value: T): void {
    this.#items.push(value);
    if (this.#items.length > this.#limit) {
      this.#items.shift();
    }
  }

  /** Most-recent-last view of the buffer. Returns a copy, never the backing array. */
  snapshot(): T[] {
    return this.#items.slice();
  }

  get length(): number {
    return this.#items.length;
  }

  get capacity(): number {
    return this.#limit;
  }
}
