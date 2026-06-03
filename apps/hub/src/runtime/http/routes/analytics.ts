import { group, route } from '@brika/router';
import { z } from 'zod';
import { Analytics } from '@/runtime/analytics/analytics';
import { EventStore } from '@/runtime/analytics/event-store';
import { isEventTelemetryEnabled } from '@/runtime/analytics/forwarder';
import { CAPTURE_SOURCES } from '@/runtime/analytics/types';
import type { Json } from '@/types';

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
  search: z.string().optional(),
  startTs: z.coerce.number().optional(),
  endTs: z.coerce.number().optional(),
  cursor: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  order: z.enum(['asc', 'desc']).default('desc'),
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
      handler: ({ body, inject }) => {
        inject(Analytics).capture(body.name, body.props as Record<string, Json> | undefined, {
          source: 'ui',
          distinctId: body.distinctId,
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

    // GET /api/analytics/stats - Totals + remote-forwarding status
    route.get({
      path: '/stats',
      handler: ({ inject }) => {
        const store = inject(EventStore);
        return {
          total: store.count(),
          ringBufferSize: inject(Analytics).recent().length,
          sources: CAPTURE_SOURCES,
          plugins: store.getPluginNames(),
          remoteForwarding: isEventTelemetryEnabled(),
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
