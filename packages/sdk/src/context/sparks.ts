/**
 * Sparks Module
 *
 * Handles spark registration, emission, and subscription.
 * Self-registers with the context module system.
 */

import type { Json } from '@brika/ipc';
import {
  emitSpark as emitSparkMsg,
  registerSpark as registerSparkMsg,
  type SparkEvent,
  sparkEvent as sparkEventMsg,
  subscribeSpark as subscribeSparkMsg,
  unsubscribeSpark as unsubscribeSparkMsg,
} from '@brika/ipc/contract';
import { type ContextCore, type MethodsOf, registerContextModule } from './register';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupSparks(core: ContextCore) {
  const { client, manifest } = core;
  const declaredSparks = new Set(manifest.sparks?.map((s) => s.id) ?? []);
  const registered = new Set<string>();
  const subscriptions = new Map<string, (event: SparkEvent) => void>();
  let subIdCounter = 0;

  client.on(sparkEventMsg, ({ subscriptionId, event }) => {
    subscriptions.get(subscriptionId)?.(event);
  });

  return {
    methods: {
      registerSpark(spark: { id: string; schema?: Record<string, unknown> }): { id: string } {
        const { id } = spark;
        if (!declaredSparks.has(id)) {
          throw new Error(
            `Spark "${id}" not in package.json. Add: "sparks": [{"id": "${id}", "name": "..."}]`
          );
        }
        if (registered.has(id)) throw new Error(`Spark "${id}" already registered`);

        registered.add(id);
        client.send(registerSparkMsg, {
          spark: { id, schema: spark.schema as Record<string, Json> | undefined },
        });
        return { id };
      },

      emitSpark(sparkId: string, payload: Json): void {
        client.send(emitSparkMsg, { sparkId, payload });
      },

      subscribeSpark(sparkType: string, handler: (event: SparkEvent) => void): () => void {
        const subscriptionId = `spark-sub-${++subIdCounter}`;
        subscriptions.set(subscriptionId, handler);
        client.send(subscribeSparkMsg, { sparkType, subscriptionId });

        return () => {
          subscriptions.delete(subscriptionId);
          client.send(unsubscribeSparkMsg, { subscriptionId });
        };
      },
    },
  };
}

// ─── Type Augmentation (inferred from setup) ─────────────────────────────────

declare module '../context' {
  interface Context extends MethodsOf<typeof setupSparks> {}
}

registerContextModule('sparks', setupSparks);
