/**
 * Analytics Capture API
 *
 * Record that a feature was used. Events flow over IPC to the hub, which
 * stores them and (when opted in) forwards them to a remote endpoint. This
 * is the plugin-facing analogue of the hub's `Analytics` service.
 *
 * @example
 * ```typescript
 * import { capture } from '@brika/sdk';
 *
 * capture('timer.started', { durationMs: 5000 });
 * capture('integration.connected', { provider: 'spotify' });
 * ```
 */

import { getContext } from '../context';
import type { AnyObj } from '../types';

/**
 * Capture a feature-usage event.
 *
 * @param name - Dotted event key, e.g. `feature.used` or `page.viewed`.
 * @param props - Optional structured context for the event.
 * @param distinctId - Optional anonymous actor/session identifier.
 */
export function capture(name: string, props?: AnyObj, distinctId?: string): void {
  getContext().capture(name, props, distinctId);
}
