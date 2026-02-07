/**
 * Brick Type Registry
 *
 * Central registry for brick types registered by plugins.
 * Types are qualified as `pluginName:brickId` (e.g., "plugin-thermostat:thermostat").
 */

import { inject, singleton } from '@brika/di';
import type { BrickFamily, PreferenceDefinition } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisteredBrickType {
  /** Full qualified ID: pluginName:brickId */
  fullId: string;
  /** Local brick type ID */
  localId: string;
  /** Owning plugin */
  pluginName: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Brick category */
  category?: string;
  /** Lucide icon name */
  icon?: string;
  /** Hex accent color */
  color?: string;
  /** Supported size families (catalog metadata) */
  families: BrickFamily[];
  /** Min grid size */
  minSize?: { w: number; h: number };
  /** Max grid size */
  maxSize?: { w: number; h: number };
  /** Per-instance configuration schema */
  config?: PreferenceDefinition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class BrickTypeRegistry {
  private readonly logs = inject(Logger).withSource('registry');

  readonly #types = new Map<string, RegisteredBrickType>();

  get size(): number {
    return this.#types.size;
  }

  register(
    brickType: {
      id: string;
      families: BrickFamily[];
      minSize?: { w: number; h: number };
      maxSize?: { w: number; h: number };
      config?: unknown[];
    },
    pluginName: string,
    manifest?: { name?: string; description?: string; category?: string; icon?: string; color?: string },
  ): string {
    const fullId = `${pluginName}:${brickType.id}`;

    if (this.#types.has(fullId)) {
      this.logs.warn('Duplicate brick type registration', { brickTypeId: fullId });
    }

    this.#types.set(fullId, {
      fullId,
      localId: brickType.id,
      pluginName,
      name: manifest?.name,
      description: manifest?.description,
      category: manifest?.category,
      icon: manifest?.icon,
      color: manifest?.color,
      families: brickType.families ?? ['sm', 'md', 'lg'],
      minSize: brickType.minSize,
      maxSize: brickType.maxSize,
      config: brickType.config as PreferenceDefinition[] | undefined,
    });

    this.logs.info('Brick type registered', { brickTypeId: fullId, pluginName });
    return fullId;
  }

  unregisterPlugin(pluginName: string): string[] {
    const removed: string[] = [];
    for (const [fullId, type] of this.#types) {
      if (type.pluginName === pluginName) {
        this.#types.delete(fullId);
        removed.push(fullId);
      }
    }
    if (removed.length > 0) {
      this.logs.info('Brick types unregistered', { pluginName, count: removed.length });
    }
    return removed;
  }

  get(fullId: string): RegisteredBrickType | undefined {
    return this.#types.get(fullId);
  }

  has(fullId: string): boolean {
    return this.#types.has(fullId);
  }

  list(): RegisteredBrickType[] {
    return [...this.#types.values()].sort((a, b) => a.fullId.localeCompare(b.fullId));
  }

  listByPlugin(pluginName: string): RegisteredBrickType[] {
    return [...this.#types.values()].filter((t) => t.pluginName === pluginName);
  }

  getProvider(fullId: string): string | undefined {
    return this.#types.get(fullId)?.pluginName;
  }
}
