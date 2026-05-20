/**
 * Hub-side handlers for the `sparks.*` capabilities.
 *
 * The spec is defined in `@brika/sdk/capabilities/sparks` (so the Ctx
 * type augmentation is visible to plugins). Here we re-bind each capability
 * with the same id to the hub's actual spark registry / subscription wiring.
 *
 * Only the plugin -> hub direction is modelled as a capability. Hub-initiated
 * dispatch of a matched spark event back to a subscribed plugin still rides
 * the legacy `sparkEvent` IPC message (see `plugin-process.ts#sendSparkEvent`
 * and `plugin-lifecycle.ts`).
 *
 * The `onSparkSubscribe` callback's implementer is responsible for tracking
 * `subscriptionId` -> internal-unsubscribe pairs so the matching
 * `onSparkUnsubscribe` (or a process shutdown) can clean up. The
 * capabilities module itself stays stateless.
 */

import { defineCapability } from '@brika/capabilities';
import type { Json } from '@brika/ipc';
import type { SparkEventType } from '@brika/ipc/contract';
import {
  sparksEmit as emitSpec,
  sparksRegister as registerSpec,
  sparksSubscribe as subscribeSpec,
  sparksUnsubscribe as unsubscribeSpec,
} from '@brika/sdk/capabilities';

export interface SparkRegistration {
  id: string;
  schema?: Record<string, Json>;
}

export interface SparksCallbacks {
  /** Plugin declared a spark id — mirrors the legacy `registerSpark` IPC. */
  onSpark(spark: SparkRegistration): void;
  /** Plugin emitted a payload — mirrors the legacy `emitSpark` IPC. */
  onSparkEmit(sparkId: string, payload: Json): void;
  /**
   * Plugin subscribed to a spark type.
   *
   * `sendEvent` is the per-subscription bridge back into the plugin — the
   * `PluginProcess` constructs it from a bound `sendSparkEvent` so the
   * capabilities module never holds a reference to `PluginProcess`. The
   * implementer of this callback is responsible for tracking
   * `subscriptionId` -> internal-unsubscribe so the matching
   * `onSparkUnsubscribe` can clean up. Mirrors the legacy `subscribeSpark`
   * IPC.
   */
  onSparkSubscribe(
    sparkType: string,
    subscriptionId: string,
    sendEvent: (event: SparkEventType) => void
  ): void;
  /** Plugin unsubscribed — mirrors the legacy `unsubscribeSpark` IPC. */
  onSparkUnsubscribe(subscriptionId: string): void;
}

/**
 * Build the four `sparks.*` capabilities bound to a per-process set of
 * callbacks. `sendEvent` is supplied by the caller (the `PluginProcess`)
 * so each subscription bridges back to the correct plugin without the
 * capabilities module holding a reference to `PluginProcess`.
 */
export function buildSparksCapabilities(
  cb: SparksCallbacks,
  sendEvent: (subscriptionId: string, event: SparkEventType) => void
) {
  return [
    defineCapability(registerSpec.spec, (_ctx, { id, schema }) => {
      cb.onSpark({ id, schema });
      return {};
    }),
    defineCapability(emitSpec.spec, (_ctx, { sparkId, payload }) => {
      cb.onSparkEmit(sparkId, payload);
      return {};
    }),
    defineCapability(subscribeSpec.spec, (_ctx, { sparkType, subscriptionId }) => {
      cb.onSparkSubscribe(sparkType, subscriptionId, (event) =>
        sendEvent(subscriptionId, event)
      );
      return {};
    }),
    defineCapability(unsubscribeSpec.spec, (_ctx, { subscriptionId }) => {
      cb.onSparkUnsubscribe(subscriptionId);
      return {};
    }),
  ];
}
