/**
 * Secrets API
 *
 * Programmatic per-plugin credential storage backed by the OS keychain
 * (Bun.secrets). Each plugin sees only its own secrets — the hub identifies
 * the caller from the IPC channel itself, not from anything the plugin sends.
 *
 * Add `"permissions": ["secrets"]` to your plugin's package.json. Without
 * the grant, every call throws PermissionDeniedError.
 *
 * Secret keys must match `^[a-zA-Z][a-zA-Z0-9_.-]*$` (1–128 chars).
 *
 * @example
 * ```typescript
 * import { getSecret, setSecret, deleteSecret } from '@brika/sdk';
 *
 * await setSecret('session-token', token);
 * const token = await getSecret('session-token');
 * await deleteSecret('session-token');
 * ```
 */

import { getContext } from '../context';

/**
 * Read a secret previously stored by this plugin. Returns `null` if not set.
 *
 * @throws {PermissionDeniedError} if the "secrets" permission is not granted
 */
export function getSecret(key: string): Promise<string | null> {
  return getContext().getSecret(key);
}

/**
 * Persist a secret in the OS keychain, scoped to this plugin only.
 * An empty string deletes the secret.
 *
 * @throws {PermissionDeniedError} if the "secrets" permission is not granted
 */
export function setSecret(key: string, value: string): Promise<void> {
  return getContext().setSecret(key, value);
}

/**
 * Remove a stored secret. Returns `true` if a secret was actually deleted.
 *
 * @throws {PermissionDeniedError} if the "secrets" permission is not granted
 */
export function deleteSecret(key: string): Promise<boolean> {
  return getContext().deleteSecret(key);
}
