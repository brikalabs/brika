/**
 * `dev.brika.secrets.*` — hub-mediated per-plugin secret storage.
 *
 * Three grants share the `secrets` permission family. Each plugin gets
 * its own keychain subspace; one operator toggle covers read/write/delete.
 * Dispatch still flows through the `getPluginSecret`/`setPluginSecret`/
 * `deletePluginSecret` RPCs — the grant entries exist so the manifest
 * unification reads the same registry the runtime checks.
 */

import { defineGrant, type PermissionGate } from '@brika/grants';
import { z } from 'zod';

export const SecretsScopeSchema = z.object({}).strict();
export type SecretsScope = z.infer<typeof SecretsScopeSchema>;

const SecretsPermission: PermissionGate<typeof SecretsScopeSchema> = {
  name: 'secrets',
  scope: SecretsScopeSchema,
  defaultScope: {},
  icon: 'key-round',
};

/**
 * Allowed key shape: starts with a letter, then alphanumerics, `_`, `.`, `-`.
 * Length 1-128. Disallows path-like sequences (`..`) at the API boundary.
 */
export const SecretKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/, 'Invalid secret key shape')
  .refine((k) => !k.includes('..'), 'Secret key may not contain ".."');

// ─── get ─────────────────────────────────────────────────────────────────────

export const SecretsGetArgsSchema = z.object({ key: SecretKeySchema });
export const SecretsGetResultSchema = z.object({
  value: z.string().nullable(),
});
export type SecretsGetArgs = z.infer<typeof SecretsGetArgsSchema>;
export type SecretsGetResult = z.infer<typeof SecretsGetResultSchema>;

export const secretsGet = defineGrant(
  {
    id: 'dev.brika.secrets.get',
    args: SecretsGetArgsSchema,
    result: SecretsGetResultSchema,
    permission: SecretsPermission,
    description: 'Read a secret stored by this plugin.',
    redact: {
      result: () => ({ value: '<redacted>' }),
    },
  },
  () => {
    throw new Error('secrets.get: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── set ─────────────────────────────────────────────────────────────────────

export const SecretsSetArgsSchema = z.object({
  key: SecretKeySchema,
  value: z.string().max(64 * 1024),
});
export const SecretsSetResultSchema = z.object({});
export type SecretsSetArgs = z.infer<typeof SecretsSetArgsSchema>;
export type SecretsSetResult = z.infer<typeof SecretsSetResultSchema>;

export const secretsSet = defineGrant(
  {
    id: 'dev.brika.secrets.set',
    args: SecretsSetArgsSchema,
    result: SecretsSetResultSchema,
    permission: SecretsPermission,
    description: 'Write a secret stored by this plugin.',
    redact: {
      args: (args) => ({ key: args.key, value: '<redacted>' }),
    },
  },
  () => {
    throw new Error('secrets.set: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── delete ──────────────────────────────────────────────────────────────────

export const SecretsDeleteArgsSchema = z.object({ key: SecretKeySchema });
export const SecretsDeleteResultSchema = z.object({
  deleted: z.boolean(),
});
export type SecretsDeleteArgs = z.infer<typeof SecretsDeleteArgsSchema>;
export type SecretsDeleteResult = z.infer<typeof SecretsDeleteResultSchema>;

export const secretsDelete = defineGrant(
  {
    id: 'dev.brika.secrets.delete',
    args: SecretsDeleteArgsSchema,
    result: SecretsDeleteResultSchema,
    permission: SecretsPermission,
    description: 'Delete a secret stored by this plugin.',
  },
  () => {
    throw new Error('secrets.delete: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);
