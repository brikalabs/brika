/**
 * Functional SDK API
 *
 * Clean, simple exports for plugin development.
 */

import type { Json } from '@brika/ipc';
import { type EventHandler as CtxEventHandler, getContext, type LogLevel } from './context';
import type { AnyObj } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get plugin preferences (configuration) sent by the hub.
 *
 * @example
 * ```typescript
 * interface MyPrefs { apiKey: string; debug: boolean; }
 * const prefs = getPreferences<MyPrefs>();
 * log("info", `API Key: ${prefs.apiKey}`);
 * ```
 */
export function getPreferences<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return getContext().getPreferences<T>();
}

export type PreferencesChangeHandler<T = Record<string, unknown>> = (preferences: T) => void;

/**
 * Register a handler that runs when preferences are updated.
 *
 * @example
 * ```typescript
 * onPreferencesChange<MyPrefs>((prefs) => {
 *   log("info", "Preferences updated!", { debugMode: prefs.debugMode });
 * });
 * ```
 */
export function onPreferencesChange<T extends Record<string, unknown> = Record<string, unknown>>(
  handler: PreferencesChangeHandler<T>
): () => void {
  return getContext().onPreferencesChange(
    handler as PreferencesChangeHandler<Record<string, unknown>>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a message to the hub.
 *
 * @example
 * ```typescript
 * log("info", "Timer started", { id: timer.id });
 * log("error", "Failed to connect");
 * ```
 */
export function log(level: LogLevel, message: string, meta?: AnyObj): void {
  getContext().log(level, message, meta);
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type EventPayload = { id: string; type: string; source: string; payload: Json; ts: number };
export type EventHandler = (event: EventPayload) => void;

/**
 * Emit an event to the hub's event bus.
 *
 * @example
 * ```typescript
 * emit("timer.completed", { id: timer.id, name: timer.name });
 * emit("motion.detected", { zone: "living-room" });
 * ```
 */
export function emit(eventType: string, payload: Json = null): void {
  getContext().emit(eventType, payload);
}

/**
 * Subscribe to events matching a pattern.
 * Returns an unsubscribe function.
 *
 * @example
 * ```typescript
 * const unsub = on("motion.*", (event) => {
 *   log("info", `Motion: ${event.type}`);
 * });
 * unsub();
 * ```
 */
export function on(pattern: string, handler: EventHandler): () => void {
  return getContext().onEvent(pattern, handler as CtxEventHandler);
}

/** Alias for `on` */
export const onEvent = on;

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

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
