/**
 * Event Bus API
 *
 * Emit and subscribe to events across the BRIKA hub.
 */

import type { Json } from '@brika/ipc';
import { type EventHandler as CtxEventHandler, getContext } from '../context';

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
