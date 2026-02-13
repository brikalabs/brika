import type { Json } from '@brika/shared';
import type { ComponentNode, Mutation } from '@brika/ui-kit';
import { applyMutations } from '@brika/ui-kit';
import { create } from 'zustand';
import type { BrickType, Dashboard, DashboardBrickPlacement, DashboardSummary } from './api';

interface DashboardStore {
  // ─── Dashboard list ────────────────────────────────────────────────────────
  dashboards: Map<string, DashboardSummary>;
  activeDashboardId: string | null;
  activeDashboard: Dashboard | null;

  // ─── Brick type catalog ─────────────────────────────────────────────────
  brickTypes: Map<string, BrickType>;

  // ─── Instance bodies (live from SSE) ───────────────────────────────────
  bodies: Map<string, ComponentNode[]>;

  // ─── Sheet state ───────────────────────────────────────────────────────────
  addBrickOpen: boolean;
  configBrickId: string | null;

  // ─── Actions ───────────────────────────────────────────────────────────────
  setDashboards(list: DashboardSummary[]): void;
  setActiveDashboard(dashboard: Dashboard | null): void;
  setBrickTypes(types: BrickType[]): void;
  setAddBrickOpen(open: boolean): void;
  setConfigBrickId(id: string | null): void;

  // Instance body mutations
  patchInstance(instanceId: string, mutations: Mutation[]): void;
  setInstanceBody(instanceId: string, body: ComponentNode[]): void;
  setBodiesBatch(entries: Array<[string, ComponentNode[]]>): void;
  removeInstanceBody(instanceId: string): void;

  // Optimistic dashboard mutations
  addBrickPlacement(placement: DashboardBrickPlacement): void;
  removeBrickPlacement(instanceId: string): void;
  updateBrickLayouts(
    layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>
  ): void;
  updateBrickConfig(instanceId: string, config: Record<string, Json>): void;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  dashboards: new Map(),
  activeDashboardId: null,
  activeDashboard: null,
  brickTypes: new Map(),
  bodies: new Map(),
  addBrickOpen: false,
  configBrickId: null,

  setDashboards(list) {
    set({ dashboards: new Map(list.map((d) => [d.id, d])) });
  },

  setActiveDashboard(dashboard) {
    if (!dashboard) {
      set({ activeDashboardId: null, activeDashboard: null });
      return;
    }
    set({ activeDashboardId: dashboard.id, activeDashboard: dashboard });
  },

  setBrickTypes(types) {
    set({ brickTypes: new Map(types.map((t) => [t.id, t])) });
  },

  setAddBrickOpen(open) {
    set({ addBrickOpen: open });
  },

  setConfigBrickId(id) {
    set({ configBrickId: id });
  },

  patchInstance(instanceId, mutations) {
    const currentBody = get().bodies.get(instanceId) ?? [];
    const newBody = applyMutations(currentBody, mutations);
    if (newBody === currentBody) return;
    const bodies = new Map(get().bodies);
    bodies.set(instanceId, newBody);
    set({ bodies });
  },

  setInstanceBody(instanceId, body) {
    const bodies = new Map(get().bodies);
    bodies.set(instanceId, body);
    set({ bodies });
  },

  setBodiesBatch(entries) {
    if (entries.length === 0) return;
    const current = get().bodies;
    const bodies = new Map(current);
    let changed = false;
    for (const [id, body] of entries) {
      const existing = current.get(id);
      // Keep the old reference if structurally identical — prevents re-render
      if (
        existing?.length === body.length &&
        JSON.stringify(existing) === JSON.stringify(body)
      )
        continue;
      bodies.set(id, body);
      changed = true;
    }
    if (changed) set({ bodies });
  },

  removeInstanceBody(instanceId) {
    const bodies = new Map(get().bodies);
    bodies.delete(instanceId);
    set({ bodies });
  },

  addBrickPlacement(placement) {
    const dashboard = get().activeDashboard;
    if (!dashboard) return;
    set({
      activeDashboard: { ...dashboard, bricks: [...dashboard.bricks, placement] },
    });
  },

  removeBrickPlacement(instanceId) {
    const dashboard = get().activeDashboard;
    if (!dashboard) return;
    set({
      activeDashboard: {
        ...dashboard,
        bricks: dashboard.bricks.filter((c) => c.instanceId !== instanceId),
      },
    });
  },

  updateBrickLayouts(layouts) {
    const dashboard = get().activeDashboard;
    if (!dashboard) return;
    const layoutMap = new Map(layouts.map((l) => [l.instanceId, l]));
    let changed = false;
    const bricks = dashboard.bricks.map((b) => {
      const l = layoutMap.get(b.instanceId);
      if (!l) return b;
      if (b.position.x === l.x && b.position.y === l.y && b.size.w === l.w && b.size.h === l.h)
        return b;
      changed = true;
      return { ...b, position: { x: l.x, y: l.y }, size: { w: l.w, h: l.h } };
    });
    if (changed) set({ activeDashboard: { ...dashboard, bricks } });
  },

  updateBrickConfig(instanceId, config) {
    const dashboard = get().activeDashboard;
    if (!dashboard) return;
    const bricks = dashboard.bricks.map((b) =>
      b.instanceId === instanceId ? { ...b, config } : b
    );
    set({ activeDashboard: { ...dashboard, bricks } });
  },
}));

// Selective subscriptions
export const useActiveDashboard = () => useDashboardStore((s) => s.activeDashboard);
export const useBrickTypes = () => useDashboardStore((s) => s.brickTypes);
export const useInstanceBody = (id: string) => useDashboardStore((s) => s.bodies.get(id));
