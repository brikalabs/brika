/**
 * Remote-access settings routes.
 *
 * Surface area:
 *   - GET /api/remote-access            current status (enabled, name, signaling state, active sessions)
 *   - PUT /api/remote-access/token      store a new signaling bearer token in the OS keychain
 *   - DELETE /api/remote-access/token   revoke the stored token (also stops any active sessions)
 *
 * The actual enable/disable + name claim live behind env vars in v0/v1; the UI
 * only mediates token rotation. This keeps the threat model tight: a stolen
 * session cannot turn remote access on for a hub that's never been configured.
 */

import { group, route } from '@brika/router';
import { z } from 'zod';
import { RemoteAccessService, SIGNALING_TOKEN_SECRET_KEY } from '@/runtime/remote-access';
import { SecretStore } from '@/runtime/secrets/secret-store';

const SetTokenSchema = z.object({
  token: z.string().min(16).max(2048),
});

export const remoteAccessRoutes = group({
  prefix: '/api/remote-access',
  routes: [
    /** Current status — UI polls this to render the settings page. */
    route.get({
      path: '/',
      handler: async ({ inject }) => {
        const service = inject(RemoteAccessService);
        const secrets = inject(SecretStore);
        const tokenPresent = (await secrets.getHubSecret(SIGNALING_TOKEN_SECRET_KEY)) !== null;
        return {
          ...service.status,
          tokenPresent,
        };
      },
    }),

    /** Store a fresh signaling bearer token. Hot-reconnects the signaling client. */
    route.put({
      path: '/token',
      body: SetTokenSchema,
      handler: async ({ body, inject }) => {
        const secrets = inject(SecretStore);
        const service = inject(RemoteAccessService);
        await secrets.setHubSecret(SIGNALING_TOKEN_SECRET_KEY, body.token);
        // Bounce the service so the new token is picked up.
        service.stop();
        await service.start();
        return { ok: true };
      },
    }),

    /** Revoke the stored token and stop the signaling client. */
    route.delete({
      path: '/token',
      handler: async ({ inject }) => {
        const secrets = inject(SecretStore);
        const service = inject(RemoteAccessService);
        service.stop();
        const removed = await secrets.deleteHubSecret(SIGNALING_TOKEN_SECRET_KEY);
        return { ok: true, removed };
      },
    }),
  ],
});
