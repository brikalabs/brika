/**
 * Opt-in remote forwarding for captured feature-usage events.
 *
 * Forwarding requires the operator to opt in (`BRIKA_TELEMETRY_EVENTS=1`) AND a
 * destination provider to be configured. The provider is chosen with
 * `BRIKA_ANALYTICS_PROVIDER` and plugs into an existing analytics platform:
 *
 *   - `webhook`  (default) → `BRIKA_TELEMETRY_URL`            posts { events }
 *   - `posthog`            → `BRIKA_ANALYTICS_POSTHOG_KEY` (+ `_HOST`)
 *   - `mixpanel`           → `BRIKA_ANALYTICS_MIXPANEL_TOKEN`
 *   - `segment`            → `BRIKA_ANALYTICS_SEGMENT_WRITE_KEY`
 *
 * Events are batched (size- or time-triggered) and POSTed fire-and-forget;
 * failures are swallowed so analytics can never affect the request pipeline.
 * String prop values are path-redacted before they leave the host. The
 * anonymous device id is sent as the platform distinct id; the authenticated
 * user id is attached only when `BRIKA_ANALYTICS_IDENTIFY` is set.
 */

import { singleton } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { redactPaths } from '@/runtime/updates/telemetry';
import type { Json } from '@/types';
import {
  type ForwardedEvent,
  type ForwardRequest,
  resolveProvider,
  shouldIdentify,
} from './providers';
import type { CaptureEvent } from './types';

const TELEMETRY_OPT_IN_ENV = 'BRIKA_TELEMETRY_EVENTS';

/** Flush when the buffer reaches this many events. */
const MAX_BATCH = 50;
/** …or after this long, whichever comes first. */
const FLUSH_INTERVAL_MS = 10_000;
/** Never block the event loop on a slow endpoint. */
const REQUEST_TIMEOUT_MS = 2000;

type Env = Readonly<Record<string, string | undefined>>;

function isOptedIn(env: Env): boolean {
  const optIn = env[TELEMETRY_OPT_IN_ENV];
  return optIn === '1' || optIn?.toLowerCase() === 'true';
}

/**
 * True when the operator opted in *and* a destination provider is configured.
 * Exposed so the UI/status surface can show an honest on/off label.
 */
export function isEventTelemetryEnabled(env: Env = process.env): boolean {
  return isOptedIn(env) && resolveProvider(env) !== null;
}

/** Forwarding status for the stats endpoint: on/off + active provider name. */
export function getForwardingStatus(env: Env = process.env): {
  enabled: boolean;
  provider: string | null;
} {
  if (!isOptedIn(env)) {
    return { enabled: false, provider: null };
  }
  const provider = resolveProvider(env);
  return { enabled: provider !== null, provider: provider?.name ?? null };
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
      distinctId: event.distinctId,
      // Local-only by default; attached for forwarding only when identify is on.
      userId: shouldIdentify() ? event.userId : undefined,
      props: redactProps(event.props),
    });

    if (this.#queue.length >= MAX_BATCH) {
      this.flush();
      return;
    }
    this.#timer ??= setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  /** Drain the buffer and POST the batch to the active provider. */
  flush(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#queue.length === 0) {
      return;
    }

    const provider = resolveProvider();
    if (!provider) {
      this.#queue.length = 0;
      return;
    }

    const batch = this.#queue.splice(0, this.#queue.length);
    void this.#post(provider.buildRequest(batch));
  }

  async #post(request: ForwardRequest): Promise<void> {
    try {
      await fetch(request.url, {
        method: 'POST',
        headers: {
          ...request.headers,
          'User-Agent': `brika/${brikaContext.version}`,
        },
        body: request.body,
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
