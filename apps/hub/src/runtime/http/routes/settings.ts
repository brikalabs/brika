/**
 * Settings Routes
 *
 * Hub-level configuration endpoints (location, etc.).
 */

import { group, route } from '@brika/router';
import { HubLocation as HubLocationSchema } from '@brika/ipc/contract';
import { StateStore } from '@/runtime/state/state-store';

export const settingsRoutes = group('/api/settings', [
  /** Get the hub's configured location */
  route.get('/location', ({ inject }) => {
    const state = inject(StateStore);
    return { location: state.getHubLocation() };
  }),

  /** Set the hub's location */
  route.put('/location', { body: HubLocationSchema }, async ({ body, inject }) => {
    const state = inject(StateStore);
    await state.setHubLocation(body);
    return { location: body };
  }),

  /** Clear the hub's location */
  route.delete('/location', async ({ inject }) => {
    const state = inject(StateStore);
    await state.setHubLocation(null);
    return { ok: true };
  }),
]);
