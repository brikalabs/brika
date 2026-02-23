/**
 * Board Service
 *
 * High-level operations for managing boards and their brick placements.
 * Bridges between BoardLoader (YAML persistence), BrickTypeRegistry
 * (type validation), and BrickInstanceManager (instance lifecycle).
 */

import { inject, singleton } from '@brika/di';
import type { Json } from '@/types';
import { BrickInstanceManager, BrickTypeRegistry } from '@/runtime/bricks';
import { BoardActions, BrickActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { BoardLoader } from './board-loader';
import type { Board, BoardBrickPlacement } from './types';

let instanceCounter = 0;
function generateInstanceId(): string {
  return `inst-${Date.now().toString(36)}-${(++instanceCounter).toString(36)}`;
}

const DEFAULT_SIZE = { w: 2, h: 2 };

@singleton()
export class BoardService {
  private readonly logs = inject(Logger).withSource('state');
  private readonly loader = inject(BoardLoader);
  private readonly brickTypes = inject(BrickTypeRegistry);
  private readonly instances = inject(BrickInstanceManager);
  private readonly lifecycle = inject(PluginLifecycle);
  private readonly events = inject(EventSystem);

  readonly #activeViewers = new Map<string, number>();

  viewerConnected(boardId: string): void {
    const count = (this.#activeViewers.get(boardId) ?? 0) + 1;
    this.#activeViewers.set(boardId, count);
    if (count === 1) {
      const board = this.loader.get(boardId);
      if (board) this.mountBoard(board);
    }
  }

  viewerDisconnected(boardId: string): void {
    const count = (this.#activeViewers.get(boardId) ?? 1) - 1;
    if (count <= 0) {
      this.#activeViewers.delete(boardId);
      const board = this.loader.get(boardId);
      if (board) this.unmountBoard(board);
    } else {
      this.#activeViewers.set(boardId, count);
    }
  }

  hasActiveViewers(boardId: string): boolean {
    return (this.#activeViewers.get(boardId) ?? 0) > 0;
  }

  mountBoard(board: Board): void {
    for (const brick of board.bricks) {
      this.#mountPlacement(brick);
    }
  }

  /**
   * Mount any pending placements that reference a newly registered brick type.
   * Solves the startup race where boards load before plugins register types.
   */
  mountPendingForType(brickTypeId: string): void {
    for (const board of this.loader.list()) {
      if (!this.hasActiveViewers(board.id)) continue;
      for (const brick of board.bricks) {
        if (brick.brickTypeId === brickTypeId && !this.instances.has(brick.instanceId)) {
          this.#mountPlacement(brick);
        }
      }
    }
  }

  /**
   * Unmount all brick instances for a board.
   */
  unmountBoard(board: Board): void {
    for (const brick of board.bricks) {
      this.#unmountPlacement(brick);
    }
  }

  /**
   * Add a brick to a board.
   */
  async addBrick(
    boardId: string,
    brickTypeId: string,
    config: Record<string, Json>,
    position?: { x: number; y: number },
    size?: { w: number; h: number }
  ): Promise<BoardBrickPlacement | null> {
    const board = this.loader.get(boardId);
    if (!board) return null;

    const brickType = this.brickTypes.get(brickTypeId);
    if (!brickType) return null;

    const placement: BoardBrickPlacement = {
      instanceId: generateInstanceId(),
      brickTypeId,
      config,
      position: position ?? this.#findNextPosition(board),
      size: size ?? DEFAULT_SIZE,
    };

    board.bricks.push(placement);
    await this.loader.saveBoard(board);
    if (this.hasActiveViewers(boardId)) {
      this.#mountPlacement(placement);
    }

    this.events.dispatch(
      BoardActions.brickAdded.create(
        { boardId, instanceId: placement.instanceId, placement },
        'hub'
      )
    );

    return placement;
  }

  /**
   * Remove a brick from a board.
   */
  async removeBrick(boardId: string, instanceId: string): Promise<boolean> {
    const board = this.loader.get(boardId);
    if (!board) return false;

    const idx = board.bricks.findIndex((c) => c.instanceId === instanceId);
    if (idx === -1) return false;

    const [placement] = board.bricks.splice(idx, 1);
    await this.loader.saveBoard(board);
    this.#unmountPlacement(placement);

    this.events.dispatch(BoardActions.brickRemoved.create({ boardId, instanceId }, 'hub'));

    return true;
  }

  /**
   * Update a brick's config — pushes new config to the running instance
   * without unmount/remount so hook state (timers, effects) is preserved.
   */
  async updateBrickConfig(
    boardId: string,
    instanceId: string,
    config: Record<string, Json>
  ): Promise<boolean> {
    const found = this.#findPlacement(boardId, instanceId);
    if (!found) return false;

    const { board, brick } = found;
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

    await this.loader.saveBoard(board);

    this.events.dispatch(
      BoardActions.brickConfigChanged.create({ boardId, instanceId, config }, 'hub')
    );

    return true;
  }

  /**
   * Rename a brick instance (custom label).
   */
  async updateBrickLabel(
    boardId: string,
    instanceId: string,
    label: string | undefined
  ): Promise<boolean> {
    const found = this.#findPlacement(boardId, instanceId);
    if (!found) return false;

    const { board, brick } = found;
    brick.label = label;
    await this.loader.saveBoard(board);

    this.events.dispatch(
      BoardActions.brickLabelChanged.create({ boardId, instanceId, label }, 'hub')
    );

    return true;
  }

  /**
   * Move/resize a brick. Sends resize IPC to the plugin (no remount).
   */
  async moveBrick(
    boardId: string,
    instanceId: string,
    position: { x: number; y: number },
    size: { w: number; h: number }
  ): Promise<boolean> {
    const found = this.#findPlacement(boardId, instanceId);
    if (!found) return false;

    const { board, brick } = found;
    const sizeChanged = brick.size.w !== size.w || brick.size.h !== size.h;
    brick.position = position;
    brick.size = size;

    if (sizeChanged) {
      this.#resizePlacement(brick);
    }

    await this.loader.saveBoard(board);
    return true;
  }

  /**
   * Batch update layout positions after drag-and-drop.
   * Sends resize IPC for bricks whose size changed (no remount).
   */
  async batchUpdateLayout(
    boardId: string,
    layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>
  ): Promise<boolean> {
    const board = this.loader.get(boardId);
    if (!board) return false;

    const resizedBricks: BoardBrickPlacement[] = [];
    const brickMap = new Map(board.bricks.map((c) => [c.instanceId, c]));

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

    await this.loader.saveBoard(board);

    // Send resize IPC for bricks whose size changed (no remount needed)
    for (const brick of resizedBricks) {
      this.#resizePlacement(brick);
    }

    this.events.dispatch(BoardActions.layoutChanged.create({ boardId, layouts }, 'hub'));

    return true;
  }

  #findPlacement(
    boardId: string,
    instanceId: string
  ): { board: Board; brick: BoardBrickPlacement } | null {
    const board = this.loader.get(boardId);
    if (!board) return null;
    const brick = board.bricks.find((c) => c.instanceId === instanceId);
    if (!brick) return null;
    return { board, brick };
  }

  #mountPlacement(placement: BoardBrickPlacement): void {
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
      placement.config
    );

    // Tell the plugin to mount
    const process = this.lifecycle.getProcess(brickType.pluginName);
    if (process) {
      process.sendMountBrickInstance(
        placement.instanceId,
        placement.brickTypeId,
        placement.size.w,
        placement.size.h,
        placement.config
      );
    }

    this.events.dispatch(
      BrickActions.instanceMounted.create(
        { instanceId: placement.instanceId, brickTypeId: placement.brickTypeId },
        'hub'
      )
    );
  }

  #resizePlacement(placement: BoardBrickPlacement): void {
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

  #unmountPlacement(placement: BoardBrickPlacement): void {
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
      BrickActions.instanceUnmounted.create({ instanceId: placement.instanceId }, 'hub')
    );
  }

  #findNextPosition(board: Board): { x: number; y: number } {
    if (board.bricks.length === 0) return { x: 0, y: 0 };

    // Find the lowest y + h to place below existing bricks
    let maxBottom = 0;
    for (const brick of board.bricks) {
      const bottom = brick.position.y + brick.size.h;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return { x: 0, y: maxBottom };
  }
}
