import { Action, EventSystem as BaseEventSystem, type Unsubscribe } from '@elia/events';
import type { EliaEvent, Json } from '@elia/shared';
import { inject, singleton } from '@elia/shared';
import { LogRouter } from '@/runtime/logs/log-router';

class RingBuffer<T> {
  readonly #buf: Array<T | undefined>;
  readonly #cap: number;
  #head = 0;
  #len = 0;

  constructor(cap: number) {
    this.#cap = cap;
    this.#buf = new Array(cap);
  }

  push(v: T): void {
    this.#buf[this.#head] = v;
    this.#head = (this.#head + 1) % this.#cap;
    this.#len = Math.min(this.#len + 1, this.#cap);
  }

  snapshot(): T[] {
    const out: T[] = [];
    const start = (this.#head - this.#len + this.#cap) % this.#cap;
    for (let i = 0; i < this.#len; i++) {
      const v = this.#buf[(start + i) % this.#cap];
      if (v !== undefined) out.push(v);
    }
    return out;
  }
}

/**
 * Hub's event system singleton.
 * Provides fully typed events with Zod validation and Promise support.
 */
@singleton()
export class EventSystem extends BaseEventSystem {
  private readonly logs = inject(LogRouter);
  readonly #history = new RingBuffer<EliaEvent>(1000);

  constructor() {
    super();
    // Subscribe to all events and store them in history
    super.subscribeAll((action) => {
      const event: EliaEvent = {
        id: action.id,
        type: action.type,
        source: action.source ?? 'unknown',
        payload: action.payload as Json,
        ts: action.timestamp,
      };
      this.#history.push(event);
    });
  }

  override dispatch<T extends Action>(action: T): Promise<T> {
    this.logs.debug('event.dispatch', {
      type: action.type,
      source: action.source,
      id: action.id,
    });

    return super.dispatch(action);
  }

  /**
   * Query event history
   */
  query(): EliaEvent[] {
    return this.#history.snapshot();
  }
}
