/**
 * Remote-access settings routes.
 *
 * Surface area:
 *   - GET    /api/remote-access                  current status
 *   - PATCH  /api/remote-access                  update coordinator URL
 *   - POST   /api/remote-access/claim            claim a name with the coordinator
 *   - DELETE /api/remote-access                  forget the claim (release + wipe local)
 *   - POST   /api/remote-access/test-coordinator probe the configured coordinator's /v1/health
 */

import { group, route } from '@brika/router';
import { z } from 'zod';
import { RemoteAccessClaimError, RemoteAccessService } from '@/runtime/remote-access';

const ClaimSchema = z.object({
  name: z.string().min(4).max(32),
});

const PatchSchema = z.object({
  coordinatorOrigin: z.url().max(2048),
});

function handleClaimError(err: unknown): Response {
  if (err instanceof RemoteAccessClaimError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  throw err;
}

export const remoteAccessRoutes = group({
  prefix: '/api/remote-access',
  routes: [
    route.get({
      path: '/',
      handler: ({ inject }) => inject(RemoteAccessService).status(),
    }),

    /** Patch the coordinator URL (single mutable field for now). */
    route.patch({
      path: '/',
      body: PatchSchema,
      handler: async ({ body, inject }) => {
        try {
          return await inject(RemoteAccessService).setCoordinatorOrigin(body.coordinatorOrigin);
        } catch (err) {
          return handleClaimError(err);
        }
      },
    }),

    /** Claim a name with the coordinator and persist the returned token. */
    route.post({
      path: '/claim',
      body: ClaimSchema,
      handler: async ({ body, inject }) => {
        try {
          const result = await inject(RemoteAccessService).claim(body.name);
          return { ok: true, ...result };
        } catch (err) {
          return handleClaimError(err);
        }
      },
    }),

    /**
     * Probe the configured coordinator. Returns whether it answered and the
     * HTTP status — used by the UI's "Test connection" button.
     */
    route.post({
      path: '/test-coordinator',
      handler: ({ inject }) => inject(RemoteAccessService).testCoordinator(),
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
