/**
 * Sparks capability specs.
 *
 * Four plugin-initiated capabilities backing the sparks subsystem:
 *
 *   - `sparks.register`    — declare a spark type the plugin will emit.
 *   - `sparks.emit`        — fan a payload out to every subscriber.
 *   - `sparks.subscribe`   — start receiving spark events of a given type.
 *   - `sparks.unsubscribe` — stop receiving events for a previous subscription.
 *
 * NOTE: only the plugin -> hub direction is modelled as a capability. Hub-
 * initiated dispatch of a matched spark event back into a subscribed plugin
 * still rides the legacy `sparkEvent` IPC message (see
 * `@brika/ipc/contract/sparks`). Capabilities only model plugin-initiated
 * calls.
 *
 * The permission gate currently uses an empty scope shape (`z.object({})`) —
 * the real per-spark-type scope shape lands when the manifest schema gains
 * the per-capability grant model. For now the gate matches how the legacy
 * "sparks" permission worked: a single yes/no grant per plugin.
 *
 * The handler lives in `apps/hub/src/runtime/plugins/capabilities/sparks.ts`;
 * this file defines only the spec (so it can be imported from both sides) and
 * the Ctx augmentation (so plugin types see `ctx.sparks.register()` etc.).
 */

import { defineCapability } from '@brika/capabilities';
import { Json, JsonRecord } from '@brika/ipc';
import { z } from 'zod';

/** Declare that the plugin owns a spark id. The hub records the registration. */
export const sparksRegister = defineCapability(
  {
    id: 'dev.brika.sparks.register',
    ctxPath: 'sparks.register',
    args: z.object({
      /** Local spark id (without the plugin prefix). */
      id: z.string(),
      /** Optional JSON Schema used to validate payloads at emit time. */
      schema: JsonRecord.optional(),
    }),
    result: z.object({}),
    description: 'Declare a spark type the plugin emits',
    permission: {
      name: 'sparks',
      scope: z.object({}),
      defaultScope: {},
      icon: 'zap',
    },
  },
  // Handler is registered in the hub; the spec lives here. The throw is a
  // safety net — if anyone ever dispatches against this spec without
  // re-binding it to a real handler, the test boundary will catch it.
  () => {
    throw new Error(
      'sparks.register handler is not registered. The hub must register a handler before plugin code can call ctx.sparks.register().'
    );
  }
);

/** Emit a spark payload to every subscriber of the given local spark id. */
export const sparksEmit = defineCapability(
  {
    id: 'dev.brika.sparks.emit',
    ctxPath: 'sparks.emit',
    args: z.object({
      /** Local spark id (without the plugin prefix). */
      sparkId: z.string(),
      /** Event payload — any JSON-serializable value. */
      payload: Json,
    }),
    result: z.object({}),
    description: 'Emit a spark event to every subscriber',
    permission: {
      name: 'sparks',
      scope: z.object({}),
      defaultScope: {},
      icon: 'zap',
    },
  },
  () => {
    throw new Error(
      'sparks.emit handler is not registered. The hub must register a handler before plugin code can call ctx.sparks.emit().'
    );
  }
);

/**
 * Subscribe to a spark type. The hub records the subscription and uses the
 * legacy `sparkEvent` IPC message to dispatch each matching event back to the
 * plugin keyed on the supplied `subscriptionId`.
 */
export const sparksSubscribe = defineCapability(
  {
    id: 'dev.brika.sparks.subscribe',
    ctxPath: 'sparks.subscribe',
    args: z.object({
      /** Fully-qualified spark type (`pluginId:sparkId`). */
      sparkType: z.string(),
      /** Unique subscription id — the plugin uses it to unsubscribe later. */
      subscriptionId: z.string(),
    }),
    result: z.object({}),
    description: 'Subscribe to spark events of a given type',
    permission: {
      name: 'sparks',
      scope: z.object({}),
      defaultScope: {},
      icon: 'zap',
    },
  },
  () => {
    throw new Error(
      'sparks.subscribe handler is not registered. The hub must register a handler before plugin code can call ctx.sparks.subscribe().'
    );
  }
);

/** Cancel a previous subscription so the plugin stops receiving its events. */
export const sparksUnsubscribe = defineCapability(
  {
    id: 'dev.brika.sparks.unsubscribe',
    ctxPath: 'sparks.unsubscribe',
    args: z.object({
      /** Subscription id previously returned to `sparks.subscribe`. */
      subscriptionId: z.string(),
    }),
    result: z.object({}),
    description: 'Cancel a previous spark subscription',
    permission: {
      name: 'sparks',
      scope: z.object({}),
      defaultScope: {},
      icon: 'zap',
    },
  },
  () => {
    throw new Error(
      'sparks.unsubscribe handler is not registered. The hub must register a handler before plugin code can call ctx.sparks.unsubscribe().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    sparks: {
      /**
       * Declare a spark type the plugin will emit. The id must also appear in
       * the manifest's `sparks` array; the hub ignores undeclared sparks.
       *
       * Requires the `sparks` permission. Throws `PermissionDeniedError`
       * at the SDK boundary if the user has not granted it.
       */
      register(args: { id: string; schema?: Record<string, Json> }): Promise<Record<string, never>>;

      /**
       * Emit a spark payload to every subscriber of the local `sparkId`.
       *
       * Requires the `sparks` permission.
       */
      emit(args: { sparkId: string; payload: Json }): Promise<Record<string, never>>;

      /**
       * Subscribe to spark events of a given fully-qualified type. The hub
       * delivers each matching event back via the legacy `sparkEvent` IPC
       * message keyed on `subscriptionId`.
       *
       * Requires the `sparks` permission.
       */
      subscribe(args: {
        sparkType: string;
        subscriptionId: string;
      }): Promise<Record<string, never>>;

      /**
       * Cancel a previous subscription so the plugin stops receiving its
       * events. Idempotent — unknown subscription ids resolve normally.
       *
       * Requires the `sparks` permission.
       */
      unsubscribe(args: { subscriptionId: string }): Promise<Record<string, never>>;
    };
  }
}
