import { Action, EventSystem as BaseEventSystem, type Unsubscribe } from '@brika/events';
import type { BrikaEvent, Json } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';
import type { SparkStore } from '@/runtime/sparks/spark-store';

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
  private readonly logs = inject(Logger);
  readonly #history = new RingBuffer<BrikaEvent>(1000);
  #sparkStore: SparkStore | null = null;

  constructor() {
    super();
    // Subscribe to all events and store them in history
    super.subscribeAll((action) => {
      const event: BrikaEvent = {
        id: action.id,
        type: action.type,
        source: action.source ?? 'unknown',
        payload: action.payload as Json,
        ts: action.timestamp,
      };
      this.#history.push(event);

      // Persist spark events to database
      if (action.type === 'spark.emit' && this.#sparkStore) {
        const payload = action.payload as { type: string; source: string; payload: unknown };
        this.#sparkStore.insert({
          ts: action.timestamp,
          type: payload.type,
          source: payload.source,
          pluginId: action.source ?? null,
          payload: payload.payload as Json,
        });
      }
    });
  }

  /**
   * Set the spark store for persistence
   */
  setSparkStore(store: SparkStore): void {
    this.#sparkStore = store;
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
   * Query event history (in-memory ring buffer)
   */
  query(): BrikaEvent[] {
    return this.#history.snapshot();
  }
}
