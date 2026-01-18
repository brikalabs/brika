/**
 * BRIKA SDK API
 *
 * Modular exports for plugin development.
 */

export type { EventHandler, EventPayload } from './events';
export { emit, on, onEvent } from './events';
export type { InitHandler, StopHandler, UninstallHandler } from './lifecycle';
export { onInit, onStop, onUninstall } from './lifecycle';
export { log } from './logging';
export type { PreferencesChangeHandler } from './preferences';
export { getPreferences, onPreferencesChange } from './preferences';
