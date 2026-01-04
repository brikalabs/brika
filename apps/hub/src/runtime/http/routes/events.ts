import { group, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import { GenericEventActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';

export const eventsRoutes = group('/api/events', [
  route.get('/', ({ inject }) => {
    return inject(EventSystem).query();
  }),

  route.post(
    '/',
    {
      body: z.object({
        type: z.string(),
        payload: z.unknown().optional(),
      }),
    },
    ({ body, inject }) => {
      const events = inject(EventSystem);
      const action = GenericEventActions.emit.create(
        {
          type: body.type,
          source: 'api',
          payload: body.payload ?? null,
        },
        'api'
      );
      events.dispatch(action);
      // Return EliaEvent format for API compatibility
      return {
        id: action.id,
        type: action.type,
        source: action.source ?? 'unknown',
        payload: action.payload as Json,
        ts: action.timestamp,
      };
    }
  ),
]);
