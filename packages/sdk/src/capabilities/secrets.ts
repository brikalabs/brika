/**
 * Secrets capability specs.
 *
 * Three permission-gated capabilities backing the plugin secret store. The
 * permission gate currently uses an empty scope shape (`z.object({})`) — the
 * real per-key / per-namespace scope shape lands when the manifest schema
 * gains the per-capability grant model. For now the gate matches how the
 * legacy "secrets" permission worked: a single yes/no grant per plugin.
 *
 * The handler lives in `apps/hub/src/runtime/plugins/capabilities/secrets.ts`;
 * this file defines only the spec (so it can be imported from both sides) and
 * the Ctx augmentation (so plugin types see `ctx.secrets.get()` etc.).
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

/** Read a stored secret by key. Returns `null` if the key is unset. */
export const secretsGet = defineCapability(
  {
    id: 'secrets.get',
    args: z.object({ key: z.string() }),
    result: z.object({ value: z.string().nullable() }),
    description: "Read a plugin-scoped secret by key",
    permission: {
      name: 'secrets',
      scope: z.object({}),
      defaultScope: {},
      icon: 'key-round',
    },
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'secrets.get handler is not registered. The hub must register a handler before plugin code can call ctx.secrets.get().'
    );
  }
);

/** Write a secret value under the given key. */
export const secretsSet = defineCapability(
  {
    id: 'secrets.set',
    args: z.object({ key: z.string(), value: z.string() }),
    result: z.object({}),
    description: "Write a plugin-scoped secret by key",
    permission: {
      name: 'secrets',
      scope: z.object({}),
      defaultScope: {},
      icon: 'key-round',
    },
  },
  () => {
    throw new Error(
      'secrets.set handler is not registered. The hub must register a handler before plugin code can call ctx.secrets.set().'
    );
  }
);

/** Delete a stored secret. Returns whether a value was actually removed. */
export const secretsDelete = defineCapability(
  {
    id: 'secrets.delete',
    args: z.object({ key: z.string() }),
    result: z.object({ deleted: z.boolean() }),
    description: "Delete a plugin-scoped secret by key",
    permission: {
      name: 'secrets',
      scope: z.object({}),
      defaultScope: {},
      icon: 'key-round',
    },
  },
  () => {
    throw new Error(
      'secrets.delete handler is not registered. The hub must register a handler before plugin code can call ctx.secrets.delete().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    secrets: {
      /**
       * Read a plugin-scoped secret by key.
       *
       * Requires the `secrets` permission. Throws `PermissionDeniedError`
       * at the SDK boundary if the user has not granted it.
       */
      get(args: { key: string }): Promise<{ value: string | null }>;

      /**
       * Write a plugin-scoped secret value by key.
       *
       * Requires the `secrets` permission.
       */
      set(args: { key: string; value: string }): Promise<Record<string, never>>;

      /**
       * Delete a plugin-scoped secret by key. Resolves with `deleted: true`
       * when a value was removed, `false` when the key was already unset.
       *
       * Requires the `secrets` permission.
       */
      delete(args: { key: string }): Promise<{ deleted: boolean }>;
    };
  }
}
