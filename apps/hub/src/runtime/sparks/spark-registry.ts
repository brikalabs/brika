/**
 * Spark Registry
 *
 * Central registry for spark (typed event) definitions received from plugins.
 * Sparks are qualified as `pluginId:sparkId` (e.g., "plugin-switch:pressed").
 */

import { inject, singleton } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisteredSpark {
  /** Full qualified type: pluginId:sparkId */
  type: string;
  /** Local spark ID */
  id: string;
  /** Owning plugin */
  pluginId: string;
  /** JSON Schema for payload validation */
  schema?: Record<string, unknown>;
  /** Display name from package.json */
  name?: string;
  /** Description from package.json */
  description?: string;
}

export interface SparkSummary {
  /** Full qualified type: pluginId:sparkId */
  type: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Owning plugin */
  pluginId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class SparkRegistry {
  private readonly logs = inject(Logger).withSource('registry');

  /** Spark definitions by full type */
  readonly #sparks = new Map<string, RegisteredSpark>();

  /** Listeners called when a spark is registered */
  readonly #onRegisterListeners = new Set<(type: string) => void>();

  /**
   * Get number of registered sparks
   */
  get size(): number {
    return this.#sparks.size;
  }

  /**
   * Subscribe to spark registration events
   */
  onSparkRegistered(listener: (type: string) => void): () => void {
    this.#onRegisterListeners.add(listener);
    return () => this.#onRegisterListeners.delete(listener);
  }

  /**
   * Register a spark definition from a plugin
   * The full type will be `pluginId:sparkId` (e.g., "plugin-switch:pressed")
   */
  register(spark: { id: string; schema?: Record<string, unknown> }, pluginId: string): void {
    const fullType = `${pluginId}:${spark.id}`;

    if (this.#sparks.has(fullType)) {
      this.logs.warn('Duplicate spark registration detected', {
        sparkType: fullType,
        existingPlugin: this.#sparks.get(fullType)?.pluginId ?? null,
        newPlugin: pluginId,
      });
    }

    this.#sparks.set(fullType, {
      type: fullType,
      id: spark.id,
      pluginId,
      schema: spark.schema,
    });

    this.logs.info('Spark registered successfully', {
      sparkType: fullType,
      pluginId: pluginId,
    });

    // Notify listeners
    for (const listener of this.#onRegisterListeners) {
      try {
        listener(fullType);
      } catch (e) {
        this.logs.error(
          'Spark registration listener failed',
          {
            sparkType: fullType,
          },
          { error: e }
        );
      }
    }
  }

  /**
   * Unregister all sparks from a plugin
   */
  unregisterPlugin(pluginId: string): number {
    let count = 0;
    for (const [type, spark] of this.#sparks) {
      if (spark.pluginId === pluginId) {
        this.#sparks.delete(type);
        count++;
      }
    }
    if (count > 0) {
      this.logs.info('Sparks unregistered from plugin', {
        pluginId: pluginId,
        count: count,
      });
    }
    return count;
  }

  /**
   * Get a spark definition by full type
   */
  get(type: string): RegisteredSpark | undefined {
    return this.#sparks.get(type);
  }

  /**
   * Check if a spark type exists
   */
  has(type: string): boolean {
    return this.#sparks.has(type);
  }

  /**
   * Get all registered spark definitions
   */
  list(): RegisteredSpark[] {
    return [...this.#sparks.values()].sort((a, b) => a.type.localeCompare(b.type));
  }

  /**
   * Get sparks registered by a specific plugin
   */
  listByPlugin(pluginId: string): RegisteredSpark[] {
    return [...this.#sparks.values()].filter((s) => s.pluginId === pluginId);
  }

  /**
   * Get sparks by owner returning SparkSummary
   */
  listByOwner(pluginId: string): SparkSummary[] {
    return [...this.#sparks.values()]
      .filter((s) => s.pluginId === pluginId)
      .map((s) => ({
        type: s.type,
        name: s.name,
        description: s.description,
        pluginId: s.pluginId,
      }));
  }

  /**
   * Get all spark summaries for UI
   */
  listSummaries(): SparkSummary[] {
    return [...this.#sparks.values()].map((s) => ({
      type: s.type,
      name: s.name,
      description: s.description,
      pluginId: s.pluginId,
    }));
  }

  /**
   * Get the plugin ID that provides a spark
   */
  getProvider(type: string): string | undefined {
    return this.#sparks.get(type)?.pluginId;
  }
}
