/**
 * Dashboard Service
 *
 * High-level operations for managing dashboards and their brick placements.
 * Bridges between DashboardLoader (YAML persistence), BrickTypeRegistry
 * (type validation), and BrickInstanceManager (instance lifecycle).
 */

import { inject, singleton } from '@brika/di';
import type { Json } from '@brika/shared';
import { BrickInstanceManager, BrickTypeRegistry } from '@/runtime/bricks';
import { BrickActions, DashboardActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { DashboardLoader } from './dashboard-loader';
import type { Dashboard, DashboardBrickPlacement } from './types';

let instanceCounter = 0;
function generateInstanceId(): string {
  return `inst-${Date.now().toString(36)}-${(++instanceCounter).toString(36)}`;
}

const DEFAULT_SIZE = { w: 2, h: 2 };

@singleton()
export class DashboardService {
  private readonly logs = inject(Logger).withSource('state');
  private readonly loader = inject(DashboardLoader);
  private readonly brickTypes = inject(BrickTypeRegistry);
  private readonly instances = inject(BrickInstanceManager);
  private readonly lifecycle = inject(PluginLifecycle);
  private readonly events = inject(EventSystem);

  /**
   * Mount all brick instances for a dashboard.
   * Called when a dashboard is loaded from YAML.
   */
  mountDashboard(dashboard: Dashboard): void {
    for (const brick of dashboard.bricks) {
      this.#mountPlacement(brick);
    }
  }

  /**
   * Mount any pending placements that reference a newly registered brick type.
   * Solves the startup race where dashboards load before plugins register types.
   */
  mountPendingForType(brickTypeId: string): void {
    for (const dashboard of this.loader.list()) {
      for (const brick of dashboard.bricks) {
        if (brick.brickTypeId === brickTypeId && !this.instances.has(brick.instanceId)) {
          this.#mountPlacement(brick);
        }
      }
    }
  }

  /**
   * Unmount all brick instances for a dashboard.
   */
  unmountDashboard(dashboard: Dashboard): void {
    for (const brick of dashboard.bricks) {
      this.#unmountPlacement(brick);
    }
  }

  /**
   * Add a brick to a dashboard.
   */
  async addBrick(
    dashboardId: string,
    brickTypeId: string,
    config: Record<string, Json>,
    position?: { x: number; y: number },
    size?: { w: number; h: number },
  ): Promise<DashboardBrickPlacement | null> {
    const dashboard = this.loader.get(dashboardId);
    if (!dashboard) return null;

    const brickType = this.brickTypes.get(brickTypeId);
    if (!brickType) return null;

    const placement: DashboardBrickPlacement = {
      instanceId: generateInstanceId(),
      brickTypeId,
      config,
      position: position ?? this.#findNextPosition(dashboard),
      size: size ?? DEFAULT_SIZE,
    };

    dashboard.bricks.push(placement);
    await this.loader.saveDashboard(dashboard);
    this.#mountPlacement(placement);

    this.events.dispatch(
      DashboardActions.brickAdded.create(
        { dashboardId, instanceId: placement.instanceId, placement },
        'hub',
      ),
    );

    return placement;
  }

  /**
   * Remove a brick from a dashboard.
   */
  async removeBrick(dashboardId: string, instanceId: string): Promise<boolean> {
    const dashboard = this.loader.get(dashboardId);
    if (!dashboard) return false;

    const idx = dashboard.bricks.findIndex((c) => c.instanceId === instanceId);
    if (idx === -1) return false;

    const [placement] = dashboard.bricks.splice(idx, 1);
    await this.loader.saveDashboard(dashboard);
    this.#unmountPlacement(placement);

    this.events.dispatch(
      DashboardActions.brickRemoved.create(
        { dashboardId, instanceId },
        'hub',
      ),
    );

    return true;
  }

  /**
   * Update a brick's config — pushes new config to the running instance
   * without unmount/remount so hook state (timers, effects) is preserved.
   */
  async updateBrickConfig(
    dashboardId: string,
    instanceId: string,
    config: Record<string, Json>,
  ): Promise<boolean> {
    const found = this.#findPlacement(dashboardId, instanceId);
    if (!found) return false;

    const { dashboard, brick } = found;
    brick.config = config;

    // Update config on the hub-side manager
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.config = config;
    }

    // Push config to the plugin process (no remount)
    const brickType = this.brickTypes.get(brick.brickTypeId);
    if (brickType) {
      const process = this.lifecycle.getProcess(brickType.pluginName);
      if (process) {
        process.sendUpdateBrickConfig(instanceId, config);
      }
    }

    await this.loader.saveDashboard(dashboard);

    this.events.dispatch(
      DashboardActions.brickConfigChanged.create(
        { dashboardId, instanceId, config },
        'hub',
      ),
    );

    return true;
  }

  /**
   * Move/resize a brick. Sends resize IPC to the plugin (no remount).
   */
  async moveBrick(
    dashboardId: string,
    instanceId: string,
    position: { x: number; y: number },
    size: { w: number; h: number },
  ): Promise<boolean> {
    const found = this.#findPlacement(dashboardId, instanceId);
    if (!found) return false;

    const { dashboard, brick } = found;
    const sizeChanged = brick.size.w !== size.w || brick.size.h !== size.h;
    brick.position = position;
    brick.size = size;

    if (sizeChanged) {
      this.#resizePlacement(brick);
    }

    await this.loader.saveDashboard(dashboard);
    return true;
  }

  /**
   * Batch update layout positions after drag-and-drop.
   * Sends resize IPC for bricks whose size changed (no remount).
   */
  async batchUpdateLayout(
    dashboardId: string,
    layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>,
  ): Promise<boolean> {
    const dashboard = this.loader.get(dashboardId);
    if (!dashboard) return false;

    const resizedBricks: DashboardBrickPlacement[] = [];
    const brickMap = new Map(dashboard.bricks.map((c) => [c.instanceId, c]));

    for (const layout of layouts) {
      const brick = brickMap.get(layout.instanceId);
      if (!brick) continue;

      const sizeChanged = brick.size.w !== layout.w || brick.size.h !== layout.h;
      brick.position = { x: layout.x, y: layout.y };
      brick.size = { w: layout.w, h: layout.h };

      if (sizeChanged) {
        resizedBricks.push(brick);
      }
    }

    await this.loader.saveDashboard(dashboard);

    // Send resize IPC for bricks whose size changed (no remount needed)
    for (const brick of resizedBricks) {
      this.#resizePlacement(brick);
    }

    this.events.dispatch(
      DashboardActions.layoutChanged.create({ dashboardId, layouts }, 'hub'),
    );

    return true;
  }

  #findPlacement(
    dashboardId: string,
    instanceId: string,
  ): { dashboard: Dashboard; brick: DashboardBrickPlacement } | null {
    const dashboard = this.loader.get(dashboardId);
    if (!dashboard) return null;
    const brick = dashboard.bricks.find((c) => c.instanceId === instanceId);
    if (!brick) return null;
    return { dashboard, brick };
  }

  #mountPlacement(placement: DashboardBrickPlacement): void {
    const brickType = this.brickTypes.get(placement.brickTypeId);
    if (!brickType) {
      this.logs.warn('Cannot mount brick: type not found', {
        instanceId: placement.instanceId,
        brickTypeId: placement.brickTypeId,
      });
      return;
    }

    // Skip if already mounted (prevents duplicate mount events from file watcher)
    if (this.instances.has(placement.instanceId)) return;

    // Register instance in the manager
    this.instances.mount(
      placement.instanceId,
      placement.brickTypeId,
      brickType.pluginName,
      placement.size.w,
      placement.size.h,
      placement.config,
    );

    // Tell the plugin to mount
    const process = this.lifecycle.getProcess(brickType.pluginName);
    if (process) {
      process.sendMountBrickInstance(
        placement.instanceId,
        placement.brickTypeId,
        placement.size.w,
        placement.size.h,
        placement.config,
      );
    }

    this.events.dispatch(
      BrickActions.instanceMounted.create(
        { instanceId: placement.instanceId, brickTypeId: placement.brickTypeId },
        'hub',
      ),
    );
  }

  #resizePlacement(placement: DashboardBrickPlacement): void {
    const instance = this.instances.get(placement.instanceId);
    if (!instance) return;

    // Update stored dimensions
    this.instances.resize(placement.instanceId, placement.size.w, placement.size.h);

    // Tell the plugin to resize (no remount)
    const brickType = this.brickTypes.get(placement.brickTypeId);
    if (brickType) {
      const process = this.lifecycle.getProcess(brickType.pluginName);
      if (process) {
        process.sendResizeBrickInstance(placement.instanceId, placement.size.w, placement.size.h);
      }
    }
  }

  #unmountPlacement(placement: DashboardBrickPlacement): void {
    const brickType = this.brickTypes.get(placement.brickTypeId);

    // Tell the plugin to unmount
    if (brickType) {
      const process = this.lifecycle.getProcess(brickType.pluginName);
      if (process) {
        process.sendUnmountBrickInstance(placement.instanceId);
      }
    }

    this.instances.unmount(placement.instanceId);

    this.events.dispatch(
      BrickActions.instanceUnmounted.create(
        { instanceId: placement.instanceId },
        'hub',
      ),
    );
  }

  #findNextPosition(dashboard: Dashboard): { x: number; y: number } {
    if (dashboard.bricks.length === 0) return { x: 0, y: 0 };

    // Find the lowest y + h to place below existing bricks
    let maxBottom = 0;
    for (const brick of dashboard.bricks) {
      const bottom = brick.position.y + brick.size.h;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return { x: 0, y: maxBottom };
  }
}
