/**
 * Forwarder providers — adapters that translate Brika capture events into the
 * ingestion format of an external product-analytics platform.
 *
 * Each adapter is a pure `buildRequest(batch) -> { url, headers, body }`
 * function so it can be unit-tested without a network. The active provider is
 * selected by `BRIKA_ANALYTICS_PROVIDER` (default `webhook`); each provider is
 * only "configured" once its required credential env var is present.
 *
 * Identity: the anonymous device id (`distinctId`) is sent as the platform's
 * distinct id — product analytics needs *some* id, and this one carries no PII.
 * The authenticated `userId` is included only when `BRIKA_ANALYTICS_IDENTIFY`
 * is set, so installs stay anonymous by default.
 */

import type { Json } from './types';

export interface ForwardedEvent {
  instanceId: string;
  ts: number;
  name: string;
  source: string;
  pluginName?: string;
  /** Anonymous device id — safe to send to a product-analytics platform. */
  distinctId?: string;
  /** Authenticated user id — only populated when identify is enabled. */
  userId?: string;
  props?: Record<string, Json>;
}

export interface ForwardRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ForwarderProvider {
  readonly name: string;
  /** Build one HTTP request for the whole batch. */
  buildRequest(events: ForwardedEvent[]): ForwardRequest;
}

type Env = Readonly<Record<string, string | undefined>>;

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

/** Fall back to the anonymous instance id when no device id is present. */
function distinctOf(event: ForwardedEvent): string {
  return event.distinctId || event.instanceId;
}

/**
 * Carry the caller's `props` into the platform payload without silently
 * dropping data on a name collision with a key we set ourselves (e.g. the
 * caller writes `{ source: 'cron' }` — we still need the canonical event-level
 * `source` to win, but the caller's value should remain observable). Conflict
 * keys are renamed to `_<key>` so downstream dashboards can still see them.
 */
function userProps(
  props: Record<string, Json> | undefined,
  reserved: ReadonlySet<string>
): Record<string, Json> {
  if (!props) {
    return {};
  }
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(props)) {
    out[reserved.has(k) ? `_${k}` : k] = v;
  }
  return out;
}

/** Keys every provider stamps itself; caller collisions get the `_` prefix. */
const PROVIDER_RESERVED_KEYS: ReadonlySet<string> = new Set(['source', 'plugin']);
/** PostHog-specific keys we own — `$lib` plus the BRIKA-level metadata. */
const POSTHOG_RESERVED_KEYS: ReadonlySet<string> = new Set([
  ...PROVIDER_RESERVED_KEYS,
  '$lib',
  'user_id',
]);
/** Mixpanel-specific keys we own — `$user_id` plus the BRIKA-level metadata. */
const MIXPANEL_RESERVED_KEYS: ReadonlySet<string> = new Set([
  ...PROVIDER_RESERVED_KEYS,
  '$user_id',
  '$insert_id',
  'distinct_id',
  'token',
  'time',
]);

// ── Providers ────────────────────────────────────────────────────────────────

/** Generic JSON webhook — the original behaviour. Posts `{ events: [...] }`. */
function webhookProvider(url: string): ForwarderProvider {
  return {
    name: 'webhook',
    buildRequest: (events) => ({
      url,
      headers: JSON_HEADERS,
      body: JSON.stringify({ events }),
    }),
  };
}

/** PostHog batch capture API (`POST {host}/batch/`). */
function posthogProvider(apiKey: string, host: string): ForwarderProvider {
  const url = `${host.replace(/\/+$/, '')}/batch/`;
  return {
    name: 'posthog',
    buildRequest: (events) => ({
      url,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        api_key: apiKey,
        batch: events.map((e) => ({
          event: e.name,
          timestamp: new Date(e.ts).toISOString(),
          distinct_id: distinctOf(e),
          properties: {
            // Caller props first — but any key we reserve below is aliased to
            // `_<key>` so it can't shadow our values *and* isn't silently lost.
            ...userProps(e.props, POSTHOG_RESERVED_KEYS),
            source: e.source,
            ...(e.pluginName ? { plugin: e.pluginName } : {}),
            $lib: 'brika',
            ...(e.userId ? { user_id: e.userId } : {}),
          },
        })),
      }),
    }),
  };
}

/**
 * Build a Mixpanel-safe `$insert_id` for dedup. The platform constraint is
 * `[a-zA-Z0-9-]{1,36}`; event names contain dots and the obvious
 * `${instanceId}-${ts}-${name}` would both violate the charset and overflow
 * the length. We hash the event name (djb2, base36) and concatenate the
 * fixed-width instanceId + ts: ~26 alphanumeric chars total, always within
 * the limit.
 */
function mixpanelInsertId(event: ForwardedEvent): string {
  let hash = 5381;
  for (let i = 0; i < event.name.length; i++) {
    hash = ((hash * 33) ^ event.name.charCodeAt(i)) >>> 0;
  }
  return `${event.instanceId}-${event.ts.toString(36)}-${hash.toString(36)}`;
}

/**
 * Mixpanel `/track` API (accepts a JSON array; `ip=0` disables geo-IP).
 *
 * Wire format notes (verified against Mixpanel's HTTP ingestion docs):
 *   - `time` is **seconds**, not milliseconds — sending `Date.now()` makes
 *     Mixpanel place events in the year ~55000 and silently drop them.
 *   - `$insert_id` must match `[a-zA-Z0-9-]{1,36}` for dedup to apply.
 */
function mixpanelProvider(token: string): ForwarderProvider {
  return {
    name: 'mixpanel',
    buildRequest: (events) => ({
      url: 'https://api.mixpanel.com/track?ip=0',
      headers: JSON_HEADERS,
      body: JSON.stringify(
        events.map((e) => ({
          event: e.name,
          properties: {
            // Caller props first — reserved-key collisions are aliased to
            // `_<key>` (see userProps) so our wire-protocol values always win
            // without dropping caller data.
            ...userProps(e.props, MIXPANEL_RESERVED_KEYS),
            token,
            time: Math.floor(e.ts / 1000),
            $insert_id: mixpanelInsertId(e),
            distinct_id: distinctOf(e),
            source: e.source,
            ...(e.pluginName ? { plugin: e.pluginName } : {}),
            ...(e.userId ? { $user_id: e.userId } : {}),
          },
        }))
      ),
    }),
  };
}

/** Segment batch API (`POST /v1/batch`, HTTP Basic auth with the write key). */
function segmentProvider(writeKey: string): ForwarderProvider {
  const authorization = `Basic ${btoa(`${writeKey}:`)}`;
  return {
    name: 'segment',
    buildRequest: (events) => ({
      url: 'https://api.segment.io/v1/batch',
      headers: { ...JSON_HEADERS, Authorization: authorization },
      body: JSON.stringify({
        batch: events.map((e) => ({
          type: 'track',
          event: e.name,
          anonymousId: distinctOf(e),
          ...(e.userId ? { userId: e.userId } : {}),
          timestamp: new Date(e.ts).toISOString(),
          properties: {
            // Same collision-safe merge as the other providers.
            ...userProps(e.props, PROVIDER_RESERVED_KEYS),
            source: e.source,
            ...(e.pluginName ? { plugin: e.pluginName } : {}),
          },
        })),
      }),
    }),
  };
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Default PostHog Cloud ingestion host (US region) when one isn't configured.
 * EU-region projects must set `BRIKA_ANALYTICS_POSTHOG_HOST=https://eu.i.posthog.com`
 * (or their self-hosted URL). PostHog Cloud's free tier works out of the box.
 */
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Resolve the configured provider, or `null` when the selected provider is
 * missing its required credential. `webhook` is the default for back-compat.
 */
export function resolveProvider(env: Env = process.env): ForwarderProvider | null {
  const provider = (env.BRIKA_ANALYTICS_PROVIDER ?? 'webhook').toLowerCase();
  switch (provider) {
    case 'webhook': {
      const url = env.BRIKA_TELEMETRY_URL;
      return url ? webhookProvider(url) : null;
    }
    case 'posthog': {
      const key = env.BRIKA_ANALYTICS_POSTHOG_KEY;
      return key
        ? posthogProvider(key, env.BRIKA_ANALYTICS_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST)
        : null;
    }
    case 'mixpanel': {
      const token = env.BRIKA_ANALYTICS_MIXPANEL_TOKEN;
      return token ? mixpanelProvider(token) : null;
    }
    case 'segment': {
      const key = env.BRIKA_ANALYTICS_SEGMENT_WRITE_KEY;
      return key ? segmentProvider(key) : null;
    }
    default:
      return null;
  }
}

/** Whether to attach the authenticated user id to forwarded events. */
export function shouldIdentify(env: Env = process.env): boolean {
  const value = env.BRIKA_ANALYTICS_IDENTIFY;
  return value === '1' || value?.toLowerCase() === 'true';
}
