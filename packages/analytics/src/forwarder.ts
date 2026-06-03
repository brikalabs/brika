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
 * String prop values (including nested ones) are path-redacted before they
 * leave the host. The anonymous device id is sent as the platform distinct id;
 * the authenticated user id is attached only when `BRIKA_ANALYTICS_IDENTIFY`
 * is set.
 */

import { inject, singleton } from '@brika/di';
import { ANALYTICS_HOST, type AnalyticsHost } from './host';
import {
  type ForwardedEvent,
  type ForwarderProvider,
  type ForwardRequest,
  resolveProvider,
  shouldIdentify,
} from './providers';
import type { CaptureEvent, Json } from './types';

const TELEMETRY_OPT_IN_ENV = 'BRIKA_TELEMETRY_EVENTS';

/** Flush when the buffer reaches this many events. */
const MAX_BATCH = 50;
/** …or after this long, whichever comes first. */
const FLUSH_INTERVAL_MS = 10_000;
/** Never block the event loop on a slow endpoint. */
const REQUEST_TIMEOUT_MS = 2000;
/**
 * Hard ceiling on the in-memory forward queue. If the downstream is wedged
 * (slow/erroring) and capture continues, we drop the oldest events rather
 * than letting host memory grow unbounded.
 */
const MAX_QUEUE = 10_000;
/** Cap recursion depth on prop redaction to defuse pathological payloads. */
const MAX_REDACT_DEPTH = 6;

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

/**
 * Accept only well-formed http(s) URLs as forwarding destinations. The
 * destination is operator-configured (env vars), never request input — but a
 * misconfiguration like `file:///etc/...` or a typo'd `javascript:` scheme
 * should be refused before it reaches `fetch`. This also satisfies the SAST
 * SSRF gate so the package can be scanned cleanly.
 */
function isHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Recursively redact string values inside a JSON tree. The host's redactor
 * (e.g. the hub's path scrubber) is applied to every string at every depth,
 * so nested data like `{ context: { path: '/Users/<name>/...' } }` no longer
 * leaks the OS username to PostHog/Mixpanel/Segment. Capped at
 * {@link MAX_REDACT_DEPTH} so a deeply-nested or cyclic prop tree can't
 * exhaust the stack — anything past the cap is replaced with `null`.
 */
function redactValue(value: Json, redact: (s: string) => string, depth: number): Json {
  if (depth > MAX_REDACT_DEPTH) {
    return null;
  }
  if (typeof value === 'string') {
    return redact(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, redact, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, redact, depth + 1);
    }
    return out;
  }
  return value;
}

function redactProps(
  props: Record<string, Json> | undefined,
  redact: (value: string) => string
): Record<string, Json> | undefined {
  if (!props) {
    return undefined;
  }
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = redactValue(value, redact, 1);
  }
  return out;
}

@singleton()
export class EventForwarder {
  readonly #queue: ForwardedEvent[] = [];
  #timer?: Timer;
  // Resolved lazily on first forward so the host only needs to register
  // ANALYTICS_HOST when forwarding is actually enabled (opt-in).
  #host: AnalyticsHost | null = null;
  // Flipped after a missing-host injection so we don't repeatedly throw and
  // recover on every capture. Forwarding stays off until the process restarts.
  #disabled = false;
  // One-time signal: the operator opted in but no host context was registered.
  // We disable forwarding rather than throwing into the capture hot path.
  #warnedMissingHost = false;
  // Cached provider + opt-in decision. `undefined` means "not yet resolved";
  // `null` means "resolved and disabled". Computed once on first enqueue/flush
  // so the env-keyed switch in resolveProvider() doesn't run on every capture.
  // Reset on stop() so a re-init after env changes picks up the new config.
  #cachedProvider: ForwarderProvider | null | undefined;

  #activeProvider(): ForwarderProvider | null {
    if (this.#cachedProvider !== undefined) {
      return this.#cachedProvider;
    }
    this.#cachedProvider = isEventTelemetryEnabled() ? resolveProvider() : null;
    return this.#cachedProvider;
  }

  #hostContext(): AnalyticsHost | null {
    if (this.#host) {
      return this.#host;
    }
    try {
      this.#host = inject<AnalyticsHost>(ANALYTICS_HOST);
      return this.#host;
    } catch {
      if (!this.#warnedMissingHost) {
        this.#warnedMissingHost = true;
        // The analytics package deliberately doesn't depend on a logger —
        // console.warn is the agreed-upon fallback for this single one-time
        // boot-config diagnostic.
        console.warn(
          '[analytics] BRIKA_TELEMETRY_EVENTS=1 but ANALYTICS_HOST not registered — remote forwarding disabled.'
        );
      }
      this.#disabled = true;
      return null;
    }
  }

  enqueue(event: CaptureEvent): void {
    if (this.#disabled || !this.#activeProvider()) {
      return;
    }

    const host = this.#hostContext();
    if (!host) {
      return;
    }
    const redact = host.redact ?? ((value: string) => value);

    // Backpressure: drop oldest if the buffer is at its hard cap. We accept
    // event loss in this degraded mode rather than growing host memory while
    // the downstream is wedged.
    if (this.#queue.length >= MAX_QUEUE) {
      this.#queue.shift();
    }

    this.#queue.push({
      instanceId: host.instanceId,
      ts: event.ts,
      name: event.name,
      source: event.source,
      pluginName: event.pluginName,
      distinctId: event.distinctId,
      // Local-only by default; attached for forwarding only when identify is on.
      userId: shouldIdentify() ? event.userId : undefined,
      props: redactProps(event.props, redact),
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

    const provider = this.#activeProvider();
    if (!provider) {
      this.#queue.length = 0;
      return;
    }

    const batch = this.#queue.splice(0, this.#queue.length);
    void this.#post(provider.buildRequest(batch));
  }

  async #post(request: ForwardRequest): Promise<void> {
    // Defence-in-depth: the URL comes from resolveProvider() which reads
    // operator env, never request input — but refuse anything that isn't a
    // plain http(s) URL so a misconfiguration can't turn into SSRF via exotic
    // schemes (file:, gopher:, javascript:).
    if (!isHttpUrl(request.url)) {
      return;
    }
    const host = this.#hostContext();
    if (!host) {
      return;
    }
    try {
      await fetch(request.url, {
        method: 'POST',
        headers: {
          ...request.headers,
          'User-Agent': host.userAgent,
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
    // Invalidate the cached provider so a fresh start() picks up any env
    // changes (mostly relevant in tests and hot reloads).
    this.#cachedProvider = undefined;
  }
}
