/**
 * BRIKA SDK API
 *
 * Modular exports for plugin development.
 * All of these are re-exported from the main `@brika/sdk` entry point —
 * prefer importing from `@brika/sdk` directly.
 */

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export type { InitHandler, StopHandler, UninstallHandler } from './lifecycle';
export { onInit, onStop, onUninstall } from './lifecycle';

// ─── Logging ──────────────────────────────────────────────────────────────────

export { log } from './logging';

// ─── Preferences ──────────────────────────────────────────────────────────────

export type { PreferencesChangeHandler } from './preferences';
export {
  definePreferenceOptions,
  getPreferences,
  onPreferencesChange,
  setPreference,
} from './preferences';

// ─── Sparks ───────────────────────────────────────────────────────────────────

export type { CompiledSpark } from './sparks';
export { defineSpark, subscribeSpark } from './sparks';

// ─── Routes ───────────────────────────────────────────────────────────────────

export type { RouteMethod, RouteRequest, RouteResponse } from '../types';
export type { RouteHandler } from './routes';
export { defineRoute } from './routes';

// ─── Actions ─────────────────────────────────────────────────────────────────

export type { ActionRef } from './actions';
export { defineAction } from './actions';

// ─── OAuth ────────────────────────────────────────────────────────────────────

export type { OAuthClient, OAuthProviderConfig, OAuthToken } from './oauth';
export { defineOAuth } from './oauth';

// ─── Storage ──────────────────────────────────────────────────────────────────

export type { Store } from './storage';
export {
  clearAllData,
  defineStore,
  deleteJSON,
  exists,
  getDataDir,
  readJSON,
  updateJSON,
  writeJSON,
} from './storage';

// ─── Location ─────────────────────────────────────────────────────────────────

export type { DeviceLocation } from './location';
export { getDeviceLocation } from './location';
