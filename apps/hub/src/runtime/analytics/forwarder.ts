/**
 * Opt-in remote forwarding for captured feature-usage events.
 *
 * Mirrors the privacy handshake used by update telemetry
 * (`apps/hub/src/runtime/updates/telemetry.ts`): forwarding only happens
 * when BOTH keys are set, so a self-hosted fork never phones home by
 * accident and an auditor can grep the binary for the endpoint:
 *
 *   1. The operator opts in:         `BRIKA_TELEMETRY_EVENTS=1`
 *   2. The build embeds an endpoint: `BRIKA_TELEMETRY_URL=https://…`
 *
 * Events are batched (size- or time-triggered) and POSTed fire-and-forget;
 * failures are swallowed so analytics can never affect the request pipeline.
 * String prop values are path-redacted before they leave the host.
 */

import { singleton } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { redactPaths } from '@/runtime/updates/telemetry';
import type { Json } from '@/types';
import type { CaptureEvent } from './types';

const TELEMETRY_URL_ENV = 'BRIKA_TELEMETRY_URL';
const TELEMETRY_OPT_IN_ENV = 'BRIKA_TELEMETRY_EVENTS';

/** Flush when the buffer reaches this many events. */
const MAX_BATCH = 50;
/** …or after this long, whichever comes first. */
const FLUSH_INTERVAL_MS = 10_000;
/** Never block the event loop on a slow endpoint. */
const REQUEST_TIMEOUT_MS = 2000;

/**
 * True when the operator opted in *and* the build has an endpoint baked in.
 * Exposed so the UI/status surface can show an honest on/off label.
 */
export function isEventTelemetryEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const optIn = env[TELEMETRY_OPT_IN_ENV];
  const url = env[TELEMETRY_URL_ENV];
  return (
    typeof url === 'string' &&
    url.length > 0 &&
    typeof optIn === 'string' &&
    (optIn === '1' || optIn.toLowerCase() === 'true')
  );
}

/** Shallow-redact string prop values; non-strings pass through untouched. */
function redactProps(props?: Record<string, Json>): Record<string, Json> | undefined {
  if (!props) {
    return undefined;
  }
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = typeof value === 'string' ? redactPaths(value) : value;
  }
  return out;
}

interface ForwardedEvent {
  instanceId: string;
  ts: number;
  name: string;
  source: string;
  pluginName?: string;
  props?: Record<string, Json>;
}

@singleton()
export class EventForwarder {
  readonly #queue: ForwardedEvent[] = [];
  #timer?: Timer;

  enqueue(event: CaptureEvent): void {
    if (!isEventTelemetryEnabled()) {
      return;
    }

    this.#queue.push({
      instanceId: brikaContext.instanceId,
      ts: event.ts,
      name: event.name,
      source: event.source,
      pluginName: event.pluginName,
      props: redactProps(event.props),
    });

    if (this.#queue.length >= MAX_BATCH) {
      this.flush();
      return;
    }
    this.#timer ??= setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  /** Drain the buffer and POST the batch. Fire-and-forget; errors swallowed. */
  flush(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#queue.length === 0) {
      return;
    }

    const url = process.env[TELEMETRY_URL_ENV];
    if (!url) {
      this.#queue.length = 0;
      return;
    }

    const batch = this.#queue.splice(0, this.#queue.length);
    void this.#post(url, batch);
  }

  async #post(url: string, batch: ForwardedEvent[]): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `brika/${brikaContext.version}`,
        },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Telemetry failures are intentional swallows.
    }
  }

  /** Stop the flush timer (graceful shutdown). Drains the final batch. */
  stop(): void {
    this.flush();
  }
}
