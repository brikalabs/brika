import {
  Analytics,
  CAPTURE_SOURCES,
  EventStore,
  getForwardingStatus,
  type Json,
} from '@brika/analytics';
import { requireSession } from '@brika/auth/server';
import { group, route } from '@brika/router';
import { z } from 'zod';

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
  search: z.string().optional(),
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
  // Arbitrary JSON context; validated as an object, trusted as Json at the
  // boundary like other ingestion routes (see action-routes/sparks).
  props: z.record(z.string(), z.unknown()).optional(),
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
        ctx
          .inject(Analytics)
          .capture(ctx.body.name, ctx.body.props as Record<string, Json> | undefined, {
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

    // DELETE /api/analytics - Clear events with optional filters
    route.delete({
      path: '/',
      body: EventClearSchema.optional(),
      handler: ({ body, inject }) => {
        const deleted = inject(EventStore).clear(body ?? {});
        return { ok: true, deleted };
      },
    }),
  ],
});
