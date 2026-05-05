/**
 * Secrets Module
 *
 * Thin typed wrapper over the prelude's per-plugin secret RPCs.
 * The hub identifies the plugin from the IPC channel itself, so a plugin
 * cannot read another plugin's secrets, hub-owned secrets, or declared
 * password preferences via these methods.
 *
 * Requires the `secrets` permission in package.json.
 */

import { rethrowRpcError } from '../errors';
import { type ContextCore, registerContextModule, requireBridge } from './register';

export function setupSecrets(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      /**
       * Read a secret previously stored by this plugin. Returns `null` if not set.
       *
       * @throws {PermissionDeniedError} if the "secrets" permission is not granted
       */
      getSecret(key: string): Promise<string | null> {
        return bridge.getSecret(key).catch(rethrowRpcError);
      },

      /**
       * Persist a secret in the OS keychain, scoped to this plugin only.
       * Storing an empty string deletes the secret.
       *
       * @throws {PermissionDeniedError} if the "secrets" permission is not granted
       */
      setSecret(key: string, value: string): Promise<void> {
        return bridge.setSecret(key, value).catch(rethrowRpcError);
      },

      /**
       * Remove a secret. Returns `true` if a secret was actually deleted.
       *
       * @throws {PermissionDeniedError} if the "secrets" permission is not granted
       */
      deleteSecret(key: string): Promise<boolean> {
        return bridge.deleteSecret(key).catch(rethrowRpcError);
      },
    },
  };
}

registerContextModule('secrets', setupSecrets);
