/**
 * Remote-access settings routes.
 *
 * Surface area:
 *   - GET    /api/remote-access       current status (claimed, name, signaling state, active sessions, coordinator)
 *   - POST   /api/remote-access/claim claim a name with the coordinator and persist the returned token
 *   - DELETE /api/remote-access       forget the claim: release with the coordinator + wipe local state
 */

import { group, route } from '@brika/router';
import { z } from 'zod';
import { RemoteAccessClaimError, RemoteAccessService } from '@/runtime/remote-access';

const ClaimSchema = z.object({
  name: z.string().min(4).max(32),
});

export const remoteAccessRoutes = group({
  prefix: '/api/remote-access',
  routes: [
    /** Current status — UI polls this to render the settings page. */
    route.get({
      path: '/',
      handler: ({ inject }) => inject(RemoteAccessService).status(),
    }),

    /** Claim a name with the coordinator and persist the returned token. */
    route.post({
      path: '/claim',
      body: ClaimSchema,
      handler: async ({ body, inject }) => {
        const service = inject(RemoteAccessService);
        try {
          const result = await service.claim(body.name);
          return { ok: true, ...result };
        } catch (err) {
          if (err instanceof RemoteAccessClaimError) {
            return new Response(
              JSON.stringify({ error: err.message, code: err.code }),
              {
                status: err.status,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          throw err;
        }
      },
    }),

    /** Forget the claim: release with the coordinator and wipe local state. */
    route.delete({
      path: '/',
      handler: async ({ inject }) => {
        const result = await inject(RemoteAccessService).forget();
        return { ok: true, ...result };
      },
    }),
  ],
});
