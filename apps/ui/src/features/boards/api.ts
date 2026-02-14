import type { Json, PreferenceDefinition } from '@brika/shared';
import type { BrickFamily, ComponentNode } from '@brika/ui-kit';
import { fetcher } from '@/lib/query';

// ─── Brick Types (plugin-provided) ──────────────────────────────────────────

export interface BrickType {
  id: string;
  localId: string;
  pluginName: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  families: BrickFamily[];
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  config?: PreferenceDefinition[];
}

// ─── Brick Instances (placed on dashboards) ─────────────────────────────────

export interface BrickInstance {
  instanceId: string;
  brickTypeId: string;
  pluginName: string;
  w: number;
  h: number;
  config: Record<string, unknown>;
  body: ComponentNode[];
}

// ─── Board ────────────────────────────────────────────────────────────────

export interface BoardSummary {
  id: string;
  name: string;
  icon?: string;
  columns: number;
  brickCount: number;
}

export interface BoardBrickPlacement {
  instanceId: string;
  brickTypeId: string;
  label?: string;
  config: Record<string, Json>;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

export interface Board {
  id: string;
  name: string;
  icon?: string;
  columns: number;
  bricks: BoardBrickPlacement[];
}

// ─── API Clients ───────────────────────────────────────────────────────────

export const brickTypesApi = {
  list: () => fetcher<BrickType[]>('/api/bricks/types'),
  get: (id: string) => fetcher<BrickType>(`/api/bricks/types/${encodeURIComponent(id)}`),
  getConfigOptions: (typeId: string, name: string) =>
    fetcher<{ options: Array<{ value: string; label: string }> }>(
      `/api/bricks/types/${encodeURIComponent(typeId)}/config/${encodeURIComponent(name)}/options`
    ),
};

export const brickInstancesApi = {
  get: (id: string) => fetcher<BrickInstance>(`/api/bricks/instances/${encodeURIComponent(id)}`),
  action: (instanceId: string, actionId: string, payload?: unknown) =>
    fetcher<{ ok: boolean }>(`/api/bricks/instances/${encodeURIComponent(instanceId)}/action`, {
      method: 'POST',
      body: JSON.stringify({ actionId, payload }),
    }),
};

export const dashboardsApi = {
  list: () => fetcher<BoardSummary[]>('/api/dashboards'),
  get: (id: string) => fetcher<Board>(`/api/dashboards/${encodeURIComponent(id)}`),
  create: (name: string, icon?: string) =>
    fetcher<Board>('/api/dashboards', {
      method: 'POST',
      body: JSON.stringify({ name, icon }),
    }),
  update: (id: string, data: { name?: string; icon?: string }) =>
    fetcher<Board>(`/api/dashboards/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetcher<{ ok: boolean }>(`/api/dashboards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  addBrick: (
    dashboardId: string,
    brickTypeId: string,
    config?: Record<string, unknown>,
    position?: { x: number; y: number },
    size?: { w: number; h: number }
  ) =>
    fetcher<BoardBrickPlacement>(`/api/dashboards/${encodeURIComponent(dashboardId)}/bricks`, {
      method: 'POST',
      body: JSON.stringify({ brickTypeId, config, position, size }),
    }),
  updateBrick: (
    dashboardId: string,
    instanceId: string,
    data: {
      label?: string;
      config?: Record<string, unknown>;
      position?: { x: number; y: number };
      size?: { w: number; h: number };
    }
  ) =>
    fetcher<{ ok: boolean }>(
      `/api/dashboards/${encodeURIComponent(dashboardId)}/bricks/${encodeURIComponent(instanceId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    ),
  removeBrick: (dashboardId: string, instanceId: string) =>
    fetcher<{ ok: boolean }>(
      `/api/dashboards/${encodeURIComponent(dashboardId)}/bricks/${encodeURIComponent(instanceId)}`,
      {
        method: 'DELETE',
      }
    ),
  batchLayout: (
    dashboardId: string,
    layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>
  ) =>
    fetcher<{ ok: boolean }>(`/api/dashboards/${encodeURIComponent(dashboardId)}/layout`, {
      method: 'PUT',
      body: JSON.stringify({ layouts }),
    }),
  reorder: (ids: string[]) =>
    fetcher<{ ok: boolean }>('/api/dashboards/order', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
};

export const dashboardKeys = {
  all: ['dashboards'] as const,
  detail: (id: string) => ['dashboards', id] as const,
  brickTypes: ['brickTypes'] as const,
  instances: ['brickInstances'] as const,
};
