/**
 * Board Service
 *
 * High-level operations for managing boards and their brick placements.
 * Bridges between BoardLoader (YAML persistence) and BrickTypeRegistry
 * (type validation).
 */

import { inject, singleton } from '@brika/di';
import { BrickTypeRegistry } from '@/runtime/bricks';
import { BoardActions } from '@/runtime/events/actions';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { Json } from '@/types';
import { BoardLoader } from './board-loader';
import type { Board, BoardBrickPlacement } from './types';

let instanceCounter = 0;
function generateInstanceId(): string {
  return `inst-${Date.now().toString(36)}-${(++instanceCounter).toString(36)}`;
}

const DEFAULT_SIZE = {
  w: 2,
  h: 2,
};

@singleton()
export class BoardService {
  private readonly logs = inject(Logger).withSource('state');
  private readonly loader = inject(BoardLoader);
  private readonly brickTypes = inject(BrickTypeRegistry);
  private readonly lifecycle = inject(PluginLifecycle);
  private readonly events = inject(EventSystem);

  readonly #activeViewers = new Map<string, number>();

  viewerConnected(boardId: string): void {
    const count = (this.#activeViewers.get(boardId) ?? 0) + 1;
    this.#activeViewers.set(boardId, count);
  }

  viewerDisconnected(boardId: string): void {
    const count = (this.#activeViewers.get(boardId) ?? 1) - 1;
    if (count <= 0) {
      this.#activeViewers.delete(boardId);
    } else {
      this.#activeViewers.set(boardId, count);
    }
  }

  hasActiveViewers(boardId: string): boolean {
    return (this.#activeViewers.get(boardId) ?? 0) > 0;
  }

  /**
   * Add a brick to a board.
   */
  async addBrick(
    boardId: string,
    brickTypeId: string,
    config: Record<string, Json>,
    position?: {
      x: number;
      y: number;
    },
    size?: {
      w: number;
      h: number;
    }
  ): Promise<BoardBrickPlacement | null> {
    const board = this.loader.get(boardId);
    if (!board) {
      return null;
    }

    const brickType = this.brickTypes.get(brickTypeId);
    if (!brickType) {
      return null;
    }

    const placement: BoardBrickPlacement = {
      instanceId: generateInstanceId(),
      brickTypeId,
      config,
      position: position ?? this.#findNextPosition(board),
      size: size ?? DEFAULT_SIZE,
    };

    board.bricks.push(placement);
    await this.loader.saveBoard(board);

    this.events.dispatch(
      BoardActions.brickAdded.create(
        {
          boardId,
          instanceId: placement.instanceId,
          placement,
        },
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
    if (!board) {
      return false;
    }

    const idx = board.bricks.findIndex((c) => c.instanceId === instanceId);
    if (idx === -1) {
      return false;
    }

    board.bricks.splice(idx, 1);
    await this.loader.saveBoard(board);

    this.events.dispatch(
      BoardActions.brickRemoved.create(
        {
          boardId,
          instanceId,
        },
        'hub'
      )
    );

    return true;
  }

  /**
   * Update a brick's config — pushes new config to the running plugin
   * so hook state (timers, effects) is preserved.
   */
  async updateBrickConfig(
    boardId: string,
    instanceId: string,
    config: Record<string, Json>
  ): Promise<boolean> {
    const found = this.#findPlacement(boardId, instanceId);
    if (!found) {
      return false;
    }

    const { board, brick } = found;
    brick.config = config;

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
      BoardActions.brickConfigChanged.create(
        {
          boardId,
          instanceId,
          config,
        },
        'hub'
      )
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
    if (!found) {
      return false;
    }

    const { board, brick } = found;
    brick.label = label;
    await this.loader.saveBoard(board);

    this.events.dispatch(
      BoardActions.brickLabelChanged.create(
        {
          boardId,
          instanceId,
          label,
        },
        'hub'
      )
    );

    return true;
  }

  /**
   * Move/resize a brick on a board.
   */
  async moveBrick(
    boardId: string,
    instanceId: string,
    position: {
      x: number;
      y: number;
    },
    size: {
      w: number;
      h: number;
    }
  ): Promise<boolean> {
    const found = this.#findPlacement(boardId, instanceId);
    if (!found) {
      return false;
    }

    const { board, brick } = found;
    brick.position = position;
    brick.size = size;

    await this.loader.saveBoard(board);
    return true;
  }

  /**
   * Batch update layout positions after drag-and-drop.
   */
  async batchUpdateLayout(
    boardId: string,
    layouts: Array<{
      instanceId: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>
  ): Promise<boolean> {
    const board = this.loader.get(boardId);
    if (!board) {
      return false;
    }

    const brickMap = new Map(board.bricks.map((c) => [c.instanceId, c]));

    for (const layout of layouts) {
      const brick = brickMap.get(layout.instanceId);
      if (!brick) {
        continue;
      }

      brick.position = {
        x: layout.x,
        y: layout.y,
      };
      brick.size = {
        w: layout.w,
        h: layout.h,
      };
    }

    await this.loader.saveBoard(board);

    this.events.dispatch(
      BoardActions.layoutChanged.create(
        {
          boardId,
          layouts,
        },
        'hub'
      )
    );

    return true;
  }

  #findPlacement(
    boardId: string,
    instanceId: string
  ): {
    board: Board;
    brick: BoardBrickPlacement;
  } | null {
    const board = this.loader.get(boardId);
    if (!board) {
      return null;
    }
    const brick = board.bricks.find((c) => c.instanceId === instanceId);
    if (!brick) {
      return null;
    }
    return {
      board,
      brick,
    };
  }

  #findNextPosition(board: Board): {
    x: number;
    y: number;
  } {
    if (board.bricks.length === 0) {
      return {
        x: 0,
        y: 0,
      };
    }

    // Find the lowest y + h to place below existing bricks
    let maxBottom = 0;
    for (const brick of board.bricks) {
      const bottom = brick.position.y + brick.size.h;
      if (bottom > maxBottom) {
        maxBottom = bottom;
      }
    }
    return {
      x: 0,
      y: maxBottom,
    };
  }
}
