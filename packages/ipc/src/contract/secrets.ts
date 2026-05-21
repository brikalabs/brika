/**
 * Plugin Secrets Contract
 *
 * RPCs for plugin programmatic secret storage. Secrets are isolated per-plugin
 * by the hub (it scopes by the trusted IPC channel identity), gated by the
 * "secrets" permission, and persisted in the OS keychain via Bun.secrets.
 *
 * Plugins cannot read another plugin's secrets, hub-owned secrets, or declared
 * password preferences via these RPCs — the hub uses a `user.*` keychain
 * subspace dedicated to programmatic plugin secrets.
 */

import { z } from 'zod';
import { rpc } from '../define';

/**
 * Allowed key shape: starts with a letter, then alphanumerics, `_`, `.`, `-`.
 * Length 1-128. Disallows path-like sequences (`..`) at the API boundary.
 */
export const SecretKey = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/, 'Invalid secret key shape')
  .refine((k) => !k.includes('..'), 'Secret key may not contain ".."');

/**
 * Plugin reads its own secret. Returns null when the secret is not set.
 *
 * @throws {BrikaError} code `PERMISSION_DENIED` if the "secrets" permission is not granted.
 * @throws {BrikaError} code `INVALID_INPUT` if the key shape is rejected.
 */
export const getPluginSecret = rpc(
  'getPluginSecret',
  z.object({
    key: SecretKey,
  }),
  z.object({
    value: z.string().nullable(),
  })
);

/**
 * Plugin writes its own secret. An empty `value` deletes the secret.
 *
 * @throws {BrikaError} code `PERMISSION_DENIED` if the "secrets" permission is not granted.
 * @throws {BrikaError} code `INVALID_INPUT` if the key shape is rejected.
 */
export const setPluginSecret = rpc(
  'setPluginSecret',
  z.object({
    key: SecretKey,
    value: z.string().max(64 * 1024),
  }),
  z.object({})
);

/**
 * Plugin deletes its own secret. Returns whether a secret was actually removed.
 *
 * @throws {BrikaError} code `PERMISSION_DENIED` if the "secrets" permission is not granted.
 * @throws {BrikaError} code `INVALID_INPUT` if the key shape is rejected.
 */
export const deletePluginSecret = rpc(
  'deletePluginSecret',
  z.object({
    key: SecretKey,
  }),
  z.object({
    deleted: z.boolean(),
  })
);
