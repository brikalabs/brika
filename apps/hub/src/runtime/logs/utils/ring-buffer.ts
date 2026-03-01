/**
 * Fixed-size circular buffer for efficient log event storage.
 * Automatically overwrites oldest entries when full.
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

  /**
   * Add an item to the buffer.
   * If buffer is full, overwrites the oldest item.
   */
  push(value: T): void {
    this.#buf[this.#head] = value;
    this.#head = (this.#head + 1) % this.#cap;
    this.#len = Math.min(this.#len + 1, this.#cap);
  }

  /**
   * Get all items in insertion order.
   * Returns a new array containing current buffer contents.
   */
  snapshot(): T[] {
    const out: T[] = [];
    const start = (this.#head - this.#len + this.#cap) % this.#cap;
    for (let i = 0; i < this.#len; i++) {
      const idx = (start + i) % this.#cap;
      const v = this.#buf[idx];
      if (v !== undefined) { out.push(v); }
    }
    return out;
  }

  /**
   * Get current number of items in buffer.
   */
  get length(): number {
    return this.#len;
  }

  /**
   * Get maximum capacity of buffer.
   */
  get capacity(): number {
    return this.#cap;
  }
}
