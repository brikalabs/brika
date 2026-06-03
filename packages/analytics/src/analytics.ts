import { inject, singleton } from '@brika/di';
import { EventStore } from './event-store';
import { EventForwarder } from './forwarder';
import { RingBuffer } from './ring-buffer';
import type { CaptureEvent, CaptureSource, Json } from './types';

export interface CaptureOptions {
  source?: CaptureSource;
  distinctId?: string;
  /** Authenticated user id, stamped server-side. Never forwarded remotely. */
  userId?: string;
  pluginName?: string;
  /** Override the timestamp (defaults to `Date.now()`). */
  ts?: number;
}

type Subscriber = (event: CaptureEvent) => void;

/** Most recent events kept in memory for a live stream / debug view. */
const RING_CAPACITY = 1000;

/**
 * Analytics capture service — the one place feature-usage events flow
 * through, whether they originate in the hub, a plugin (over IPC), the UI
 * (over HTTP), or the CLI. Each `capture()`:
 *
 *   - records to an in-memory ring buffer (live stream / `recent()`),
 *   - persists to the `events` table via the batched {@link EventStore},
 *   - fans out to subscribers (e.g. an SSE stream),
 *   - forwards to the opt-in remote endpoint via {@link EventForwarder}.
 *
 * Capture is best-effort and must never throw into a caller's hot path.
 */
@singleton()
export class Analytics {
  readonly #store = inject(EventStore);
  readonly #forwarder = inject(EventForwarder);
  readonly #ring = new RingBuffer<CaptureEvent>(RING_CAPACITY);
  readonly #subscribers = new Set<Subscriber>();
  #defaultSource: CaptureSource = 'hub';
  #enabled = true;

  /** Toggle capture wholesale (e.g. a privacy/kill switch). */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  setSource(source: CaptureSource): void {
    this.#defaultSource = source;
  }

  subscribe(fn: Subscriber): () => void {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }

  /**
   * Record that a feature was used. `name` is a dotted key
   * (e.g. `workflow.created`); `props` is optional structured context.
   */
  capture(name: string, props?: Record<string, Json>, options?: CaptureOptions): void {
    if (!this.#enabled || !name) {
      return;
    }

    const event: CaptureEvent = {
      ts: options?.ts ?? Date.now(),
      name,
      source: options?.source ?? this.#defaultSource,
      distinctId: options?.distinctId,
      userId: options?.userId,
      pluginName: options?.pluginName,
      props,
    };

    this.emit(event);
  }

  /** Emit a fully-formed event directly (used by IPC/HTTP ingress paths). */
  emit(event: CaptureEvent): void {
    if (!this.#enabled) {
      return;
    }

    this.#ring.push(event);
    this.#store.enqueue(event);
    this.#forwarder.enqueue(event);

    for (const subscriber of this.#subscribers) {
      subscriber(event);
    }
  }

  /** Snapshot of the in-memory ring buffer (most-recent-last). */
  recent(): CaptureEvent[] {
    return this.#ring.snapshot();
  }

  /** Create a capture handle that defaults to a fixed source. */
  withSource(source: CaptureSource): ScopedAnalytics {
    return new ScopedAnalytics(this, source);
  }
}

/**
 * Analytics handle bound to a preset source — the analytics analogue of
 * {@link ScopedLogger}. Callers do `inject(Analytics).withSource('plugin')`
 * once and then `capture(...)` without repeating the source.
 */
export class ScopedAnalytics {
  readonly #analytics: Analytics;
  readonly #source: CaptureSource;

  constructor(analytics: Analytics, source: CaptureSource) {
    this.#analytics = analytics;
    this.#source = source;
  }

  capture(name: string, props?: Record<string, Json>, options?: CaptureOptions): void {
    this.#analytics.capture(name, props, {
      ...options,
      source: options?.source ?? this.#source,
    });
  }
}
