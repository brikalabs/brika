/**
 * Sparks Module
 *
 * Thin typed wrapper over the prelude's spark system.
 * Manifest validation and dedup tracking live in the prelude.
 * Self-registers with the context module system.
 */

import type { Json, SparkEvent } from '../types';
import { type ContextCore, registerContextModule, requireBridge } from './register';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupSparks(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      registerSpark(spark: { id: string; schema?: Record<string, Json> }): { id: string } {
        bridge.registerSpark(spark.id, spark.schema);
        return { id: spark.id };
      },

      emitSpark(sparkId: string, payload: Json): void {
        bridge.emitSpark(sparkId, payload);
      },

      subscribeSpark(sparkType: string, handler: (event: SparkEvent) => void): () => void {
        return bridge.subscribeSpark(sparkType, handler);
      },
    },
  };
}

registerContextModule('sparks', setupSparks);
