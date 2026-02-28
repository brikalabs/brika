import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { SparkActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { SparkStore } from '@/runtime/sparks/spark-store';
import type { Json } from '@/types';

export const sparksRoutes = group({ prefix: '/api/sparks', routes: [
  /**
   * List all registered sparks with their schemas
   */
  route.get({ path: '/', handler: ({ inject }) => {
    const registry = inject(SparkRegistry);
    return registry.list().map((spark) => ({
      type: spark.type,
      id: spark.id,
      pluginId: spark.pluginId,
      name: spark.name,
      description: spark.description,
      schema: spark.schema,
    }));
  }}),

  /**
   * Get spark event history from database
   */
  route.get({
    path: '/history',
    query: z.object({
      type: z.string().optional(),
      source: z.string().optional(),
      limit: z.coerce.number().min(1).max(1000).optional(),
      cursor: z.coerce.number().optional(),
    }),
    handler: ({ query, inject }) => {
      const store = inject(SparkStore);
      const result = store.query({
        type: query.type,
        source: query.source,
        limit: query.limit,
        cursor: query.cursor,
        order: 'desc',
      });
      return {
        sparks: result.sparks,
        nextCursor: result.nextCursor,
      };
    },
  }),

  /**
   * Get a specific spark definition by type
   */
  route.get({
    path: '/:type',
    params: z.object({
      type: z.string(),
    }),
    handler: ({ params, inject }) => {
      const registry = inject(SparkRegistry);
      const spark = registry.get(params.type);
      if (!spark) {
        throw new NotFound('Spark not found');
      }
      return {
        type: spark.type,
        id: spark.id,
        pluginId: spark.pluginId,
        name: spark.name,
        description: spark.description,
        schema: spark.schema,
      };
    },
  }),

  /**
   * Emit a spark event (for debugging/testing)
   */
  route.post({
    path: '/emit',
    body: z.object({
      type: z.string(),
      payload: z.unknown().optional(),
    }),
    handler: ({ body, inject }) => {
      const events = inject(EventSystem);
      const action = SparkActions.emit.create(
        {
          type: body.type,
          source: 'debug',
          payload: body.payload ?? null,
        },
        'debug'
      );
      events.dispatch(action);
      return {
        id: action.id,
        type: body.type,
        source: 'debug',
        payload: action.payload as Json,
        ts: action.timestamp,
      };
    },
  }),
]});
