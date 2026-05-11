/**
 * Remote-access settings routes.
 *
 * Surface area:
 *   - GET    /api/remote-access            current status (enabled, name, signaling state, active sessions, tokenPresent)
 *   - POST   /api/remote-access/claim      claim a name with the coordinator and persist the returned token
 *   - PUT    /api/remote-access/token      manually store a bearer token (advanced — use /claim instead)
 *   - DELETE /api/remote-access/token      revoke the stored token + name (also stops any active sessions)
 *
 * The actual enable/disable lives behind an env flag in v0/v1 — flipping it on
 * is a deliberate operator action, not something the UI can do via a session.
 * Once enabled, name claiming and token rotation become available to admins.
 */

import { group, route } from '@brika/router';
import { z } from 'zod';
import {
  RemoteAccessClaimError,
  RemoteAccessService,
  SIGNALING_NAME_SECRET_KEY,
  SIGNALING_TOKEN_SECRET_KEY,
} from '@/runtime/remote-access';
import { SecretStore } from '@/runtime/secrets/secret-store';

const ClaimSchema = z.object({
  name: z.string().min(4).max(32),
});

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

    /** Store a fresh signaling bearer token manually. Hot-reconnects the client. */
    route.put({
      path: '/token',
      body: SetTokenSchema,
      handler: async ({ body, inject }) => {
        await inject(RemoteAccessService).setToken(body.token);
        return { ok: true };
      },
    }),

    /** Revoke the stored token + name and stop the signaling client. */
    route.delete({
      path: '/token',
      handler: async ({ inject }) => {
        const result = await inject(RemoteAccessService).forget();
        // Defensive cleanup in case forget() was called before SecretStore init.
        const secrets = inject(SecretStore);
        await secrets.deleteHubSecret(SIGNALING_TOKEN_SECRET_KEY);
        await secrets.deleteHubSecret(SIGNALING_NAME_SECRET_KEY);
        return { ok: true, removed: result.removed };
      },
    }),
  ],
});
