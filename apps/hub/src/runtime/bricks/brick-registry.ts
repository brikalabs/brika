/**
 * Brick Registry
 *
 * Central registry for dashboard brick descriptors received from plugins.
 * Bricks are qualified as `pluginName:brickId` (e.g., "plugin-thermostat:thermostat").
 */

import { inject, singleton } from '@brika/di';
import { applyMutations, type ComponentNode, type Mutation } from '@brika/ui-kit';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisteredBrick {
  /** Full qualified ID: pluginName:brickId */
  fullId: string;
  /** Local brick ID */
  id: string;
  /** Owning plugin */
  pluginName: string;
  /** Brick title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Lucide icon name */
  icon?: string;
  /** Hex accent color */
  color?: string;
  /** Brick size */
  size: 'sm' | 'md' | 'lg' | 'xl';
  /** Component node tree */
  body: unknown[];
  /** Action definitions */
  actions?: Array<{ id: string; label?: string; icon?: string }>;
  /** Brick category */
  category?: string;
  /** Tags for filtering */
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class BrickRegistry {
  private readonly logs = inject(Logger).withSource('registry');

  /** Brick descriptors by full ID */
  readonly #bricks = new Map<string, RegisteredBrick>();

  /** Listeners called when a brick is registered */
  readonly #onRegisterListeners = new Set<(fullId: string) => void>();

  get size(): number {
    return this.#bricks.size;
  }

  onBrickRegistered(listener: (fullId: string) => void): () => void {
    this.#onRegisterListeners.add(listener);
    return () => this.#onRegisterListeners.delete(listener);
  }

  register(
    brick: {
      id: string;
      title: string;
      subtitle?: string;
      icon?: string;
      color?: string;
      size: 'sm' | 'md' | 'lg' | 'xl';
      body: unknown[];
      actions?: Array<{ id: string; label?: string; icon?: string }>;
      category?: string;
      tags?: string[];
    },
    pluginName: string
  ): void {
    const fullId = `${pluginName}:${brick.id}`;

    if (this.#bricks.has(fullId)) {
      this.logs.warn('Duplicate brick registration detected', {
        brickId: fullId,
        existingPlugin: this.#bricks.get(fullId)?.pluginName ?? null,
        newPlugin: pluginName,
      });
    }

    this.#bricks.set(fullId, {
      fullId,
      id: brick.id,
      pluginName,
      title: brick.title,
      subtitle: brick.subtitle,
      icon: brick.icon,
      color: brick.color,
      size: brick.size,
      body: brick.body,
      actions: brick.actions,
      category: brick.category,
      tags: brick.tags,
    });

    this.logs.info('Brick registered successfully', {
      brickId: fullId,
      pluginName,
    });

    for (const listener of this.#onRegisterListeners) {
      try {
        listener(fullId);
      } catch (e) {
        this.logs.error('Brick registration listener failed', { brickId: fullId }, { error: e });
      }
    }
  }

  patch(fullId: string, mutations: unknown[]): boolean {
    const brick = this.#bricks.get(fullId);
    if (!brick) return false;

    brick.body = applyMutations(brick.body as ComponentNode[], mutations as Mutation[]);
    return true;
  }

  unregister(fullId: string): boolean {
    return this.#bricks.delete(fullId);
  }

  unregisterPlugin(pluginName: string): number {
    let count = 0;
    for (const [fullId, brick] of this.#bricks) {
      if (brick.pluginName === pluginName) {
        this.#bricks.delete(fullId);
        count++;
      }
    }
    if (count > 0) {
      this.logs.info('Bricks unregistered from plugin', {
        pluginName,
        count,
      });
    }
    return count;
  }

  get(fullId: string): RegisteredBrick | undefined {
    return this.#bricks.get(fullId);
  }

  has(fullId: string): boolean {
    return this.#bricks.has(fullId);
  }

  list(): RegisteredBrick[] {
    return [...this.#bricks.values()].sort((a, b) => a.fullId.localeCompare(b.fullId));
  }

  listByPlugin(pluginName: string): RegisteredBrick[] {
    return [...this.#bricks.values()].filter((c) => c.pluginName === pluginName);
  }

  /** Find the plugin that owns a brick (by full ID) */
  getProvider(fullId: string): string | undefined {
    return this.#bricks.get(fullId)?.pluginName;
  }
}
