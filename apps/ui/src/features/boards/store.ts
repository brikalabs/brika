import type { ComponentNode, Mutation } from '@brika/ui-kit';
import { applyMutations } from '@brika/ui-kit';
import { create } from 'zustand';
import type { Json } from '@/types';
import type { Board, BoardBrickPlacement, BoardSummary, BrickType } from './api';

interface BoardStore {
  // ─── Board list ────────────────────────────────────────────────────────
  boards: Map<string, BoardSummary>;
  activeBoardId: string | null;
  activeBoard: Board | null;

  // ─── Brick type catalog ─────────────────────────────────────────────────
  brickTypes: Map<string, BrickType>;

  // ─── Instance bodies (live from SSE) ───────────────────────────────────
  bodies: Map<string, ComponentNode[]>;
  disconnectedInstances: Set<string>;

  // ─── Sheet state ───────────────────────────────────────────────────────────
  addBrickOpen: boolean;
  configBrickId: string | null;

  // ─── Actions ───────────────────────────────────────────────────────────────
  setBoards(list: BoardSummary[]): void;
  setActiveBoard(board: Board | null): void;
  setBrickTypes(types: BrickType[]): void;
  setAddBrickOpen(open: boolean): void;
  setConfigBrickId(id: string | null): void;

  // Instance body mutations
  patchInstance(instanceId: string, mutations: Mutation[]): void;
  setInstanceBody(instanceId: string, body: ComponentNode[]): void;
  setBodiesBatch(
    entries: Array<
      [
        string,
        ComponentNode[],
      ]
    >
  ): void;
  removeInstanceBody(instanceId: string): void;
  markDisconnected(instanceIds: string[]): void;
  clearDisconnected(instanceId: string): void;

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
  bodies: new Map(),
  disconnectedInstances: new Set(),
  addBrickOpen: false,
  configBrickId: null,

  setBoards(list) {
    set({
      boards: new Map(
        list.map((d) => [
          d.id,
          d,
        ])
      ),
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
      brickTypes: new Map(
        types.map((t) => [
          t.id,
          t,
        ])
      ),
    });
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

  patchInstance(instanceId, mutations) {
    const currentBody = get().bodies.get(instanceId) ?? [];
    const newBody = applyMutations(currentBody, mutations);
    if (newBody === currentBody) {
      return;
    }
    const bodies = new Map(get().bodies);
    bodies.set(instanceId, newBody);
    set({
      bodies,
    });
  },

  setInstanceBody(instanceId, body) {
    if (get().bodies.get(instanceId) === body) {
      return;
    }
    const bodies = new Map(get().bodies);
    bodies.set(instanceId, body);
    set({
      bodies,
    });
  },

  setBodiesBatch(entries) {
    if (entries.length === 0) {
      return;
    }
    const bodies = new Map(get().bodies);
    for (const [id, body] of entries) {
      bodies.set(id, body);
    }
    set({
      bodies,
    });
  },

  removeInstanceBody(instanceId) {
    const bodies = new Map(get().bodies);
    bodies.delete(instanceId);
    set({
      bodies,
    });
  },

  markDisconnected(instanceIds) {
    const current = get().disconnectedInstances;
    if (instanceIds.every((id) => current.has(id))) {
      return;
    }
    const next = new Set(current);
    for (const id of instanceIds) {
      next.add(id);
    }
    set({
      disconnectedInstances: next,
    });
  },

  clearDisconnected(instanceId) {
    const current = get().disconnectedInstances;
    if (!current.has(instanceId)) {
      return;
    }
    const next = new Set(current);
    next.delete(instanceId);
    set({
      disconnectedInstances: next,
    });
  },

  addBrickPlacement(placement) {
    const board = get().activeBoard;
    if (!board) {
      return;
    }
    set({
      activeBoard: {
        ...board,
        bricks: [
          ...board.bricks,
          placement,
        ],
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
    const layoutMap = new Map(
      layouts.map((l) => [
        l.instanceId,
        l,
      ])
    );
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
export const useInstanceBody = (id: string) => useBoardStore((s) => s.bodies.get(id));
export const useIsInstanceDisconnected = (id: string) =>
  useBoardStore((s) => s.disconnectedInstances.has(id));
export const useBrickPlacement = (id: string) =>
  useBoardStore((s) => s.activeBoard?.bricks.find((b) => b.instanceId === id));
