import { singleton, inject } from "@elia/shared";
import type { EliaEvent, Json } from "@elia/shared";
import { LogRouter } from "../logs/log-router";

export type EventListener = (event: EliaEvent) => void | Promise<void>;

function matchGlob(pattern: string, text: string): boolean {
  return new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$").test(text);
}

class RingBuffer<T> {
  #buf: Array<T | undefined>;
  #cap: number;
  #head = 0;
  #len = 0;
  constructor(cap: number) { this.#cap = cap; this.#buf = new Array(cap); }
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

@singleton()
export class EventBus {
  private readonly logs = inject(LogRouter);
  #ring = new RingBuffer<EliaEvent>(1000);
  #subs = new Map<string, Set<EventListener>>();
  #globalSubs = new Set<EventListener>();

  emit(type: string, source: string, payload: Json): EliaEvent {
    const event: EliaEvent = { id: crypto.randomUUID(), type, source, payload, ts: Date.now() };
    this.#ring.push(event);
    this.logs.debug("event.emit", { type, source, id: event.id });

    for (const fn of this.#globalSubs) {
      try { fn(event); } catch (e) { this.logs.error("event.listener.error", { error: String(e) }); }
    }
    for (const [pattern, listeners] of this.#subs) {
      if (matchGlob(pattern, type)) {
        for (const fn of listeners) {
          try { fn(event); } catch (e) { this.logs.error("event.listener.error", { error: String(e) }); }
        }
      }
    }
    return event;
  }

  subscribe(pattern: string, listener: EventListener): () => void {
    if (!this.#subs.has(pattern)) this.#subs.set(pattern, new Set());
    this.#subs.get(pattern)!.add(listener);
    return () => this.unsubscribe(pattern, listener);
  }

  unsubscribe(pattern: string, listener: EventListener): void {
    this.#subs.get(pattern)?.delete(listener);
    if (this.#subs.get(pattern)?.size === 0) this.#subs.delete(pattern);
  }

  subscribeAll(listener: EventListener): () => void {
    this.#globalSubs.add(listener);
    return () => this.#globalSubs.delete(listener);
  }

  query(): EliaEvent[] { return this.#ring.snapshot(); }
}
