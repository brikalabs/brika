/**
 * Prelude Sparks Module
 *
 * Spark registration (with manifest validation and dedup),
 * emission, and subscription routing.
 */

import type { Channel, Json } from '@brika/ipc';
import type { LogLevelType, SparkEventType } from '@brika/ipc/contract';
import {
  emitSpark as emitSparkMsg,
  registerSpark as registerSparkMsg,
  sparkEvent as sparkEventMsg,
  subscribeSpark as subscribeSparkMsg,
  unsubscribeSpark as unsubscribeSparkMsg,
} from '@brika/ipc/contract';

export function setupSparks(
  channel: Channel,
  log: (level: LogLevelType, message: string) => void,
  declaredSparks: ReadonlySet<string>
) {
  const subscriptions = new Map<string, (event: SparkEventType) => void>();
  const registered = new Set<string>();
  let subIdCounter = 0;

  channel.on(sparkEventMsg, ({ subscriptionId, event }) => {
    subscriptions.get(subscriptionId)?.(event);
  });

  return {
    registerSpark(id: string, schema?: Record<string, Json>): void {
      if (!declaredSparks.has(id)) {
        throw new Error(
          `Spark "${id}" not in package.json. Add: "sparks": [{"id": "${id}", "name": "..."}]`
        );
      }
      if (registered.has(id)) {
        throw new Error(`Spark "${id}" already registered`);
      }
      registered.add(id);
      channel.send(registerSparkMsg, { spark: { id, schema } });
    },

    emitSpark(sparkId: string, payload: Json): void {
      channel.send(emitSparkMsg, { sparkId, payload });
    },

    subscribeSpark(sparkType: string, handler: (event: SparkEventType) => void): () => void {
      const subscriptionId = `spark-sub-${++subIdCounter}`;
      subscriptions.set(subscriptionId, handler);
      channel.send(subscribeSparkMsg, { sparkType, subscriptionId });

      return () => {
        subscriptions.delete(subscriptionId);
        channel.send(unsubscribeSparkMsg, { subscriptionId });
      };
    },
  };
}
