import { Analytics, CAPTURE_SOURCES, EventStore, getForwardingStatus } from '@brika/analytics';
import { Scope } from '@brika/auth';
import { requireSession } from '@brika/auth/server';
import { JsonRecord } from '@brika/ipc';
import { group, route } from '@brika/router';
import { z } from 'zod';

/**
 * Hard cap on the JSON-stringified `props` payload (KiB-class). Without this,
 * an authenticated client could fill the SQLite events table and the in-memory
 * ring buffer with arbitrarily large objects.
 */
const MAX_CAPTURE_PROPS_BYTES = 16_384;
/** Max length for the LIKE search input, bounds query-time scan work. */
const MAX_SEARCH_LEN = 200;

const CaptureSourceSchema = z.enum(['hub', 'plugin', 'ui', 'cli']);

const EventQuerySchema = z.object({
  name: z.union([z.string().transform((s) => s.split(',')), z.array(z.string())]).optional(),
  source: z
    .union([
      CaptureSourceSchema,
      z.array(CaptureSourceSchema),
      z.string().transform((s) => s.split(',') as ('hub' | 'plugin' | 'ui' | 'cli')[]),
    ])
    .optional(),
  pluginName: z.string().optional(),
  distinctId: z.string().optional(),
  userId: z.string().optional(),
  search: z.string().max(MAX_SEARCH_LEN).optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
  cursor: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const TimeSeriesQuerySchema = z.object({
  // Bucket width in ms. Default 1h; clamped to [1m, 30d].
  bucketMs: z.coerce
    .number()
    .min(60_000)
    .max(30 * 24 * 60 * 60 * 1000)
    .default(60 * 60 * 1000),
  name: z.union([z.string().transform((s) => s.split(',')), z.array(z.string())]).optional(),
  source: z
    .union([
      CaptureSourceSchema,
      z.array(CaptureSourceSchema),
      z.string().transform((s) => s.split(',') as ('hub' | 'plugin' | 'ui' | 'cli')[]),
    ])
    .optional(),
  pluginName: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
});

const CaptureBodySchema = z.object({
  name: z.string().min(1).max(200),
  // Use @brika/ipc's JsonRecord (`z.record(z.string(), z.unknown())` validated
  // and typed as the shared JSON shape) so the payload flows into
  // Analytics.capture without a cast. Size is capped below via .superRefine so
  // a single capture can't bloat the DB.
  props: JsonRecord.optional().superRefine((value, ctx) => {
    if (value && JSON.stringify(value).length > MAX_CAPTURE_PROPS_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `props exceeds ${MAX_CAPTURE_PROPS_BYTES} bytes when serialized`,
      });
    }
  }),
  distinctId: z.string().max(200).optional(),
});

const EventClearSchema = z.object({
  name: z.union([z.string(), z.array(z.string())]).optional(),
  source: z.union([CaptureSourceSchema, z.array(CaptureSourceSchema)]).optional(),
  pluginName: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
});

export const analyticsRoutes = group({
  prefix: '/api/analytics',
  routes: [
    // POST /api/analytics/capture - Record a feature-usage event from the UI
    route.post({
      path: '/capture',
      body: CaptureBodySchema,
      handler: (ctx) => {
        // Anonymous-by-default: the client supplies a durable device id; the
        // hub additionally stamps the authenticated user id server-side. The
        // user id is local-only and never leaves the host (not forwarded).
        const session = requireSession(ctx);
        ctx.inject(Analytics).capture(ctx.body.name, ctx.body.props, {
          source: 'ui',
          distinctId: ctx.body.distinctId,
          userId: session.userId,
        });
        return { ok: true };
      },
    }),

    // GET /api/analytics - Query historical events with filters
    route.get({
      path: '/',
      query: EventQuerySchema,
      handler: ({ query, inject }) => inject(EventStore).query(query),
    }),

    // GET /api/analytics/recent - In-memory recent events (ring buffer)
    route.get({
      path: '/recent',
      handler: ({ inject }) => ({ events: inject(Analytics).recent() }),
    }),

    // GET /api/analytics/names - Distinct event names with counts (for charts)
    route.get({
      path: '/names',
      handler: ({ inject }) => ({ names: inject(EventStore).topNames() }),
    }),

    // GET /api/analytics/breakdown - Event counts grouped by source and by plugin
    route.get({
      path: '/breakdown',
      handler: ({ inject }) => {
        const store = inject(EventStore);
        return { sources: store.topSources(), plugins: store.topPlugins() };
      },
    }),

    // GET /api/analytics/timeseries - Event counts bucketed over time
    route.get({
      path: '/timeseries',
      query: TimeSeriesQuerySchema,
      handler: ({ query, inject }) => {
        const { bucketMs, ...filters } = query;
        return { bucketMs, buckets: inject(EventStore).timeSeries(bucketMs, filters) };
      },
    }),

    // GET /api/analytics/stats - Totals + remote-forwarding status
    route.get({
      path: '/stats',
      handler: ({ inject }) => {
        const store = inject(EventStore);
        const forwarding = getForwardingStatus();
        return {
          total: store.count(),
          ringBufferSize: inject(Analytics).recent().length,
          sources: CAPTURE_SOURCES,
          plugins: store.getPluginNames(),
          remoteForwarding: forwarding.enabled,
          remoteForwardingProvider: forwarding.provider,
        };
      },
    }),

    // DELETE /api/analytics - Clear events with optional filters. Admin-only:
    // wiping captured usage data is a destructive operation that should not be
    // available to every authenticated session.
    route.delete({
      path: '/',
      body: EventClearSchema.optional(),
      handler: (ctx) => {
        requireSession(ctx, Scope.ADMIN_ALL);
        const deleted = ctx.inject(EventStore).clear(ctx.body ?? {});
        return { ok: true, deleted };
      },
    }),
  ],
});
