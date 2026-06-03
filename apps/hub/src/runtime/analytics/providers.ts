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

import type { Json } from '@/types';

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

/** Common properties every platform gets, merged over the event's own props. */
function baseProps(event: ForwardedEvent): Record<string, Json> {
  return {
    ...event.props,
    source: event.source,
    ...(event.pluginName ? { plugin: event.pluginName } : {}),
  };
}

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
            ...baseProps(e),
            $lib: 'brika',
            ...(e.userId ? { user_id: e.userId } : {}),
          },
        })),
      }),
    }),
  };
}

/** Mixpanel `/track` API (accepts a JSON array; `ip=0` disables geo-IP). */
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
            token,
            time: e.ts,
            $insert_id: `${e.instanceId}-${e.ts}-${e.name}`,
            distinct_id: distinctOf(e),
            ...baseProps(e),
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
          properties: baseProps(e),
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
