/**
 * Hub-side handlers for the `secrets.*` capabilities.
 *
 * The spec is defined in `@brika/sdk/capabilities/secrets` (so the Ctx
 * type augmentation is visible to plugins). Here we re-define each capability
 * with the same id but bound to the hub's actual secret store.
 *
 * Unlike the location capabilities, the secret store is plugin-scoped: every
 * read/write/delete is keyed by the plugin name so a granted plugin can never
 * reach another plugin's secrets. The factory closes over `pluginName` so each
 * `PluginProcess` gets its own bound registry — see `registry-factory.ts`.
 */

import { defineCapability } from '@brika/capabilities';
import {
  secretsDelete as deleteSpec,
  secretsGet as getSpec,
  secretsSet as setSpec,
} from '@brika/sdk/capabilities';

export interface SecretsCallbacks {
  getSecret(name: string, key: string): Promise<string | null> | string | null;
  setSecret(name: string, key: string, value: string): Promise<void> | void;
  deleteSecret(name: string, key: string): Promise<boolean> | boolean;
}

export function buildSecretsCapabilities(cb: SecretsCallbacks, pluginName: string) {
  return [
    defineCapability(getSpec.spec, async (_ctx, { key }) => ({
      value: await cb.getSecret(pluginName, key),
    })),
    defineCapability(setSpec.spec, async (_ctx, { key, value }) => {
      await cb.setSecret(pluginName, key, value);
      return {};
    }),
    defineCapability(deleteSpec.spec, async (_ctx, { key }) => ({
      deleted: await cb.deleteSecret(pluginName, key),
    })),
  ];
}
