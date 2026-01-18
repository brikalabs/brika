/**
 * Lifecycle Hooks API
 *
 * Register handlers for plugin lifecycle events.
 */

import { getContext } from '../context';

export type InitHandler = () => void | Promise<void>;
export type StopHandler = () => void | Promise<void>;
export type UninstallHandler = () => void | Promise<void>;

/**
 * Register a handler that runs when the plugin initializes.
 * If the plugin is already initialized, the handler runs immediately.
 *
 * @example
 * ```typescript
 * onInit(() => {
 *   log("info", "Plugin initialized!");
 *   setupConnections();
 * });
 * ```
 */
export function onInit(fn: InitHandler): () => void {
  return getContext().onInit(fn);
}

/**
 * Register a cleanup handler that runs when the plugin stops.
 *
 * @example
 * ```typescript
 * onStop(() => {
 *   clearAllTimers();
 * });
 * ```
 */
export function onStop(fn: StopHandler): () => void {
  return getContext().onStop(fn);
}

/**
 * Register a handler that runs when the plugin is being uninstalled.
 * Use this for permanent cleanup (delete files, revoke tokens, etc.).
 * This runs BEFORE onStop handlers.
 *
 * @example
 * ```typescript
 * onUninstall(() => {
 *   log("info", "Cleaning up plugin data...");
 *   deleteStoredCredentials();
 * });
 * ```
 */
export function onUninstall(fn: UninstallHandler): () => void {
  return getContext().onUninstall(fn);
}
