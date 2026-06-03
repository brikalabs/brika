/**
 * Fixed-size circular buffer for efficient in-memory event storage.
 * Automatically overwrites the oldest entries when full.
 */
export class RingBuffer<T> {
  readonly #buf: Array<T | undefined>;
  readonly #cap: number;
  #head = 0;
  #len = 0;

  constructor(capacity: number) {
    this.#cap = capacity;
    this.#buf = new Array<T | undefined>(capacity);
  }

  push(value: T): void {
    this.#buf[this.#head] = value;
    this.#head = (this.#head + 1) % this.#cap;
    this.#len = Math.min(this.#len + 1, this.#cap);
  }

  /** All items in insertion order (oldest first). */
  snapshot(): T[] {
    const out: T[] = [];
    const start = (this.#head - this.#len + this.#cap) % this.#cap;
    for (let i = 0; i < this.#len; i++) {
      const value = this.#buf[(start + i) % this.#cap];
      if (value !== undefined) {
        out.push(value);
      }
    }
    return out;
  }

  get length(): number {
    return this.#len;
  }

  get capacity(): number {
    return this.#cap;
  }
}
