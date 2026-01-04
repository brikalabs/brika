import type { Json, LogEvent, LogLevel } from "@brika/shared";
import { singleton } from "@brika/shared";
import type { LogStore } from "./log-store";

export interface LogRouterOptions {
  level: LogLevel;
  color: boolean;
  ringSize?: number;
}

type Subscriber = (e: LogEvent) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldLog(min: LogLevel, level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[min];
}

function formatLine(e: LogEvent, color: boolean): string {
  const d = new Date(e.ts);
  const ts = `${d.toISOString().slice(11, 23)}`;
  const src = (e.pluginRef ? `${e.source}:${e.pluginRef}` : e.source).padEnd(22, " ").slice(0, 22);
  const lvl = e.level.toUpperCase().padEnd(5, " ");
  const msg = e.message;
  const meta = e.meta ? ` ${JSON.stringify(e.meta)}` : "";
  if (!color) return `${ts} ${lvl} ${src} ${msg}${meta}`;

  const c =
    e.level === "error"
      ? "\x1b[31m"
      : e.level === "warn"
        ? "\x1b[33m"
        : e.level === "info"
          ? "\x1b[32m"
          : "\x1b[90m";

  const reset = "\x1b[0m";
  return `${ts} ${c}${lvl}${reset} ${src} ${msg}${meta}`;
}

class RingBuffer<T> {
  readonly #buf: Array<T | undefined>;
  readonly #cap: number;
  #head = 0;
  #len = 0;

  constructor(cap: number) {
    this.#cap = cap;
    this.#buf = new Array<T | undefined>(cap);
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
      const idx = (start + i) % this.#cap;
      const v = this.#buf[idx];
      if (v !== undefined) out.push(v);
    }
    return out;
  }
}

@singleton()
export class LogRouter {
  readonly #min: LogLevel;
  readonly #color: boolean;
  readonly #subs = new Set<Subscriber>();
  readonly #ring: RingBuffer<LogEvent>;
  #store: LogStore | null = null;

  constructor() {
    // Read from env - tsyringe auto-instantiates
    this.#min = (process.env.BRIKA_LOG_LEVEL ?? "info") as LogLevel;
    this.#color = process.env.BRIKA_LOG_COLOR === "1";
    this.#ring = new RingBuffer<LogEvent>(5000);
  }

  /** Connect to LogStore for persistence (called after store is initialized) */
  setStore(store: LogStore): void {
    this.#store = store;
  }

  subscribe(fn: Subscriber): () => void {
    this.#subs.add(fn);
    return () => this.#subs.delete(fn);
  }

  emit(e: LogEvent): void {
    if (!shouldLog(this.#min, e.level)) return;
    this.#ring.push(e);
    this.#store?.insert(e);
    console.log(formatLine(e, this.#color));
    for (const fn of this.#subs) fn(e);
  }

  query(): LogEvent[] {
    return this.#ring.snapshot();
  }

  debug(message: string, meta?: Record<string, Json>): void {
    this.emit({ ts: Date.now(), level: "debug", source: "hub", message, meta });
  }

  info(message: string, meta?: Record<string, Json>): void {
    this.emit({ ts: Date.now(), level: "info", source: "hub", message, meta });
  }

  warn(message: string, meta?: Record<string, Json>): void {
    this.emit({ ts: Date.now(), level: "warn", source: "hub", message, meta });
  }

  error(message: string, meta?: Record<string, Json>): void {
    this.emit({ ts: Date.now(), level: "error", source: "hub", message, meta });
  }
}
