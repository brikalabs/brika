import { create } from 'zustand';
import type { Json } from '@/types';
import type { Board, BoardBrickPlacement, BoardSummary, BrickType } from './api';

/** Shallow-compare two config objects (string-keyed, flat values). */
function shallowEqual(a: Record<string, Json>, b: Record<string, Json>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.is(a[k], b[k]));
}

interface BoardStore {
  // ─── Board list ────────────────────────────────────────────────────────
  boards: Map<string, BoardSummary>;
  activeBoardId: string | null;
  activeBoard: Board | null;

  // ─── Brick type catalog ─────────────────────────────────────────────────
  brickTypes: Map<string, BrickType>;

  // ─── Brick data (client-rendered bricks) ──────────────────────────────
  brickData: Map<string, unknown>;

  // ─── Sheet state ───────────────────────────────────────────────────────────
  addBrickOpen: boolean;
  configBrickId: string | null;

  // ─── Actions ───────────────────────────────────────────────────────────────
  setBoards(list: BoardSummary[]): void;
  setActiveBoard(board: Board | null): void;
  setBrickTypes(types: BrickType[]): void;
  setAddBrickOpen(open: boolean): void;
  setConfigBrickId(id: string | null): void;

  // Brick type updates (hot reload)
  updateBrickTypeModuleUrl(brickTypeId: string, moduleUrl: string): void;

  // Brick data mutations (client-rendered bricks)
  setBrickData(brickTypeId: string, data: unknown): void;
  setBrickDataBatch(entries: Array<[string, unknown]>): void;

  // Optimistic board mutations
  addBrickPlacement(placement: BoardBrickPlacement): void;
  removeBrickPlacement(instanceId: string): void;
  updateBrickLayouts(
    layouts: Array<{
      instanceId: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>
  ): void;
  updateBrickConfig(instanceId: string, config: Record<string, Json>): void;
  updateBrickLabel(instanceId: string, label: string | undefined): void;
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  boards: new Map(),
  activeBoardId: null,
  activeBoard: null,
  brickTypes: new Map(),
  brickData: new Map(),
  addBrickOpen: false,
  configBrickId: null,

  setBoards(list) {
    set({
      boards: new Map(list.map((d) => [d.id, d])),
    });
  },

  setActiveBoard(board) {
    if (!board) {
      set({
        activeBoardId: null,
        activeBoard: null,
      });
      return;
    }
    set({
      activeBoardId: board.id,
      activeBoard: board,
    });
  },

  setBrickTypes(types) {
    set({
      brickTypes: new Map(types.map((t) => [t.id, t])),
    });
  },

  updateBrickTypeModuleUrl(brickTypeId, moduleUrl) {
    const existing = get().brickTypes.get(brickTypeId);
    if (!existing || existing.moduleUrl === moduleUrl) {
      return;
    }
    const brickTypes = new Map(get().brickTypes);
    brickTypes.set(brickTypeId, { ...existing, moduleUrl });
    set({ brickTypes });
  },

  setAddBrickOpen(open) {
    set({
      addBrickOpen: open,
    });
  },

  setConfigBrickId(id) {
    set({
      configBrickId: id,
    });
  },

  setBrickData(brickTypeId, data) {
    const brickData = new Map(get().brickData);
    brickData.set(brickTypeId, data);
    set({ brickData });
  },

  setBrickDataBatch(entries) {
    if (entries.length === 0) {
      return;
    }
    const brickData = new Map(get().brickData);
    for (const [id, data] of entries) {
      brickData.set(id, data);
    }
    set({ brickData });
  },

  addBrickPlacement(placement) {
    const board = get().activeBoard;
    if (!board) {
      return;
    }
    set({
      activeBoard: {
        ...board,
        bricks: [...board.bricks, placement],
      },
    });
  },

  removeBrickPlacement(instanceId) {
    const board = get().activeBoard;
    if (!board) {
      return;
    }
    set({
      activeBoard: {
        ...board,
        bricks: board.bricks.filter((c) => c.instanceId !== instanceId),
      },
    });
  },

  updateBrickLayouts(layouts) {
    const board = get().activeBoard;
    if (!board) {
      return;
    }
    const layoutMap = new Map(layouts.map((l) => [l.instanceId, l]));
    let changed = false;
    const bricks = board.bricks.map((b) => {
      const l = layoutMap.get(b.instanceId);
      if (!l) {
        return b;
      }
      if (b.position.x === l.x && b.position.y === l.y && b.size.w === l.w && b.size.h === l.h) {
        return b;
      }
      changed = true;
      return {
        ...b,
        position: {
          x: l.x,
          y: l.y,
        },
        size: {
          w: l.w,
          h: l.h,
        },
      };
    });
    if (changed) {
      set({
        activeBoard: {
          ...board,
          bricks,
        },
      });
    }
  },

  updateBrickConfig(instanceId, config) {
    const board = get().activeBoard;
    if (!board) {
      return;
    }
    // Skip if config values haven't actually changed (deduplicates
    // optimistic updates followed by the SSE echo-back).
    const existing = board.bricks.find((b) => b.instanceId === instanceId);
    if (existing && shallowEqual(existing.config, config)) {
      return;
    }
    const bricks = board.bricks.map((b) =>
      b.instanceId === instanceId
        ? {
            ...b,
            config,
          }
        : b
    );
    set({
      activeBoard: {
        ...board,
        bricks,
      },
    });
  },

  updateBrickLabel(instanceId, label) {
    const board = get().activeBoard;
    if (!board) {
      return;
    }
    const bricks = board.bricks.map((b) =>
      b.instanceId === instanceId
        ? {
            ...b,
            label,
          }
        : b
    );
    set({
      activeBoard: {
        ...board,
        bricks,
      },
    });
  },
}));

// Selective subscriptions
export const useActiveBoard = () => useBoardStore((s) => s.activeBoard);
export const useBrickTypes = () => useBoardStore((s) => s.brickTypes);
export const useBrickPlacement = (id: string) =>
  useBoardStore((s) => s.activeBoard?.bricks.find((b) => b.instanceId === id));
