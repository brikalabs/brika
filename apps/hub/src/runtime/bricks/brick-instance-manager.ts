/**
 * Brick Instance Manager
 *
 * Manages mounted brick instances on boards. Each instance references
 * a brick type and stores the rendered component tree from the plugin.
 */

import { inject, singleton } from '@brika/di';
import { applyMutations, type ComponentNode, type Mutation } from '@brika/ui-kit';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BrickInstance {
  instanceId: string;
  brickTypeId: string;
  pluginName: string;
  w: number;
  h: number;
  config: Record<string, unknown>;
  body: ComponentNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Manager
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class BrickInstanceManager {
  private readonly logs = inject(Logger).withSource('registry');

  readonly #instances = new Map<string, BrickInstance>();

  get size(): number {
    return this.#instances.size;
  }

  mount(
    instanceId: string,
    brickTypeId: string,
    pluginName: string,
    w: number,
    h: number,
    config: Record<string, unknown>
  ): void {
    if (this.#instances.has(instanceId)) {
      this.logs.warn('Instance already mounted', { instanceId });
      return;
    }

    this.#instances.set(instanceId, {
      instanceId,
      brickTypeId,
      pluginName,
      w,
      h,
      config,
      body: [],
    });

    this.logs.debug('Brick instance mounted', { instanceId, brickTypeId, w, h });
  }

  resize(instanceId: string, w: number, h: number): boolean {
    const instance = this.#instances.get(instanceId);
    if (!instance) return false;
    instance.w = w;
    instance.h = h;
    return true;
  }

  unmount(instanceId: string): boolean {
    const removed = this.#instances.delete(instanceId);
    if (removed) {
      this.logs.debug('Brick instance unmounted', { instanceId });
    }
    return removed;
  }

  patchBody(instanceId: string, mutations: unknown[]): boolean {
    const instance = this.#instances.get(instanceId);
    if (!instance) return false;

    instance.body = applyMutations(instance.body, mutations as Mutation[]);
    return true;
  }

  getBody(instanceId: string): ComponentNode[] {
    return this.#instances.get(instanceId)?.body ?? [];
  }

  get(instanceId: string): BrickInstance | undefined {
    return this.#instances.get(instanceId);
  }

  has(instanceId: string): boolean {
    return this.#instances.has(instanceId);
  }

  list(): BrickInstance[] {
    return [...this.#instances.values()];
  }

  listByType(brickTypeId: string): BrickInstance[] {
    return [...this.#instances.values()].filter((i) => i.brickTypeId === brickTypeId);
  }

  /** Unmount all instances of a specific brick type. Returns removed instance IDs. */
  unmountByType(brickTypeId: string): string[] {
    return this.#removeWhere((i) => i.brickTypeId === brickTypeId);
  }

  /** Unmount all instances belonging to a plugin. Returns removed instance IDs. */
  unmountByPlugin(pluginName: string): string[] {
    return this.#removeWhere((i) => i.pluginName === pluginName);
  }

  #removeWhere(predicate: (instance: BrickInstance) => boolean): string[] {
    const removed: string[] = [];
    for (const [id, instance] of this.#instances) {
      if (predicate(instance)) {
        this.#instances.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}
