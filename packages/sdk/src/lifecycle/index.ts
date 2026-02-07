/**
 * @brika/sdk/lifecycle
 *
 * Plugin lifecycle hooks, preferences, and logging.
 */

// Lifecycle
export type { InitHandler, StopHandler, UninstallHandler } from '../api/lifecycle';
export { onInit, onStop, onUninstall } from '../api/lifecycle';

// Preferences
export type { PreferencesChangeHandler } from '../api/preferences';
export { getPreferences, onPreferencesChange } from '../api/preferences';

// Logging
export type { Logger } from '../api/logging';
export { log } from '../api/logging';

// Assets

/**
 * Returns the hub URL for a file in the plugin's `assets/` directory.
 *
 * @example
 * ```tsx
 * import { asset } from '@brika/sdk/lifecycle';
 * <Image src={asset('banner.png')} alt="Banner" />
 * ```
 */
export function asset(path: string): string {
  const uid = process.env.BRIKA_PLUGIN_UID;
  if (!uid) throw new Error('asset() can only be called from a plugin process');
  return `/api/plugins/${uid}/assets/${path}`;
}
