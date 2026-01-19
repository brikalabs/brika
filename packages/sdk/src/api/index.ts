/**
 * BRIKA SDK API
 *
 * Modular exports for plugin development.
 */

export type { InitHandler, StopHandler, UninstallHandler } from './lifecycle';
export { onInit, onStop, onUninstall } from './lifecycle';
export { log } from './logging';
export type { PreferencesChangeHandler } from './preferences';
export { getPreferences, onPreferencesChange } from './preferences';
export type { CompiledSpark } from './sparks';
export { defineSpark } from './sparks';
