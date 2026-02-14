import type { Json } from '@brika/shared';
import type { ComponentNode, Mutation } from '@brika/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { getStreamUrl } from '@/lib/query';
import { brickInstancesApi, brickTypesApi, dashboardKeys, dashboardsApi } from './api';
import { useDashboardStore } from './store';

// ─── Data fetching ─────────────────────────────────────────────────────────

export function useDashboards() {
  const setDashboards = useDashboardStore((s) => s.setDashboards);

  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const data = await dashboardsApi.list();
      setDashboards(data);
      return data;
    },
  });
}

export function useLoadDashboard(dashboardId: string | undefined) {
  const setActiveDashboard = useDashboardStore((s) => s.setActiveDashboard);

  return useQuery({
    queryKey: dashboardKeys.detail(dashboardId ?? ''),
    queryFn: async () => {
      if (!dashboardId) throw new Error('No dashboard ID');
      const data = await dashboardsApi.get(dashboardId);
      setActiveDashboard(data);
      return data;
    },
    enabled: !!dashboardId,
  });
}

export function useBrickTypesList() {
  const setBrickTypes = useDashboardStore((s) => s.setBrickTypes);

  return useQuery({
    queryKey: dashboardKeys.brickTypes,
    queryFn: async () => {
      const data = await brickTypesApi.list();
      setBrickTypes(data);
      return data;
    },
  });
}

// ─── Dashboard CRUD mutations ───────────────────────────────────────────────

export function useCreateDashboard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: { name: string; icon?: string }) =>
      dashboardsApi.create(args.name, args.icon),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useUpdateDashboard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; icon?: string } }) =>
      dashboardsApi.update(id, data),
    onSuccess: (updated) => {
      const store = useDashboardStore.getState();
      if (store.activeDashboardId === updated.id) {
        store.setActiveDashboard(updated);
      }
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.detail(updated.id) });
    },
  });
}

export function useDeleteDashboard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dashboardsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

// ─── Brick instance action ──────────────────────────────────────────────────

export function useBrickInstanceAction() {
  return useMutation({
    mutationFn: ({
      instanceId,
      actionId,
      payload,
    }: {
      instanceId: string;
      actionId: string;
      payload?: unknown;
    }) => brickInstancesApi.action(instanceId, actionId, payload),
  });
}

// ─── Dashboard mutations ───────────────────────────────────────────────────

export function useAddBrick() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      brickTypeId: string;
      config?: Record<string, unknown>;
      position?: { x: number; y: number };
      size?: { w: number; h: number };
    }) => {
      const dashboardId = useDashboardStore.getState().activeDashboardId;
      if (!dashboardId) throw new Error('No active dashboard');
      return dashboardsApi.addBrick(
        dashboardId,
        args.brickTypeId,
        args.config,
        args.position,
        args.size
      );
    },
    onSuccess: (placement) => {
      useDashboardStore.getState().addBrickPlacement(placement);
      useDashboardStore.getState().setInstanceBody(placement.instanceId, []);
      // Only invalidate the dashboard list (for brickCount), not the detail query.
      // The detail is already updated optimistically via addBrickPlacement.
      qc.invalidateQueries({ queryKey: dashboardKeys.all, exact: true });

      // Safety net: fetch the body from API after plugin has had time to render.
      setTimeout(() => {
        brickInstancesApi
          .get(placement.instanceId)
          .then((inst) => {
            if (inst.body.length > 0) {
              useDashboardStore.getState().setInstanceBody(inst.instanceId, inst.body);
            }
          })
          .catch(() => {});
      }, 500);
    },
  });
}

export function useRemoveBrick() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const dashboardId = useDashboardStore.getState().activeDashboardId;
      if (!dashboardId) throw new Error('No active dashboard');
      await dashboardsApi.removeBrick(dashboardId, instanceId);
      return instanceId;
    },
    onSuccess: (instanceId) => {
      useDashboardStore.getState().removeBrickPlacement(instanceId);
      useDashboardStore.getState().removeInstanceBody(instanceId);
      // Only invalidate the dashboard list (for brickCount), not the detail query.
      qc.invalidateQueries({ queryKey: dashboardKeys.all, exact: true });
    },
  });
}

export function useRenameBrick() {
  return useMutation({
    mutationFn: async ({
      instanceId,
      label,
    }: {
      instanceId: string;
      label: string | undefined;
    }) => {
      const dashboardId = useDashboardStore.getState().activeDashboardId;
      if (!dashboardId) throw new Error('No active dashboard');
      return dashboardsApi.updateBrick(dashboardId, instanceId, { label: label ?? '' });
    },
    onSuccess: (_, { instanceId, label }) => {
      useDashboardStore.getState().updateBrickLabel(instanceId, label);
    },
  });
}

export function useSaveLayout() {
  return useCallback(
    (layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>) => {
      const store = useDashboardStore.getState();
      if (!store.activeDashboardId) return;
      store.updateBrickLayouts(layouts);
      dashboardsApi.batchLayout(store.activeDashboardId, layouts);
    },
    []
  );
}

// ─── SSE streams ───────────────────────────────────────────────────────────

export function useDashboardSSE(dashboardId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!dashboardId) return;

    let aborted = false;
    const es = new EventSource(getStreamUrl(`/api/dashboards/${dashboardId}/sse`));

    es.addEventListener('dashboard', (ev: MessageEvent) => {
      if (aborted) return;

      let event: { type: string; payload: Record<string, unknown> };
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      const store = useDashboardStore.getState();

      switch (event.type) {
        case 'brick.snapshot': {
          const instances = event.payload.instances as Array<{
            instanceId: string;
            body: ComponentNode[];
          }>;
          store.setBodiesBatch(instances.map((i) => [i.instanceId, i.body]));
          break;
        }
        case 'brick.instancePatched': {
          const instanceId = event.payload.instanceId as string;
          const mutations = event.payload.mutations as Mutation[];
          store.clearDisconnected(instanceId);
          store.patchInstance(instanceId, mutations);
          break;
        }
        case 'brick.instanceMounted': {
          const instanceId = event.payload.instanceId as string;
          store.setInstanceBody(instanceId, []);
          break;
        }
        case 'brick.pluginDisconnected': {
          const instanceIds = event.payload.instanceIds as string[];
          store.markDisconnected(instanceIds);
          break;
        }
        case 'dashboard.brickAdded':
        case 'dashboard.brickRemoved':
          qc.invalidateQueries({ queryKey: dashboardKeys.all, exact: true });
          break;
        case 'dashboard.layoutChanged': {
          const layouts = event.payload.layouts as Array<{
            instanceId: string;
            x: number;
            y: number;
            w: number;
            h: number;
          }>;
          store.updateBrickLayouts(layouts);
          break;
        }
        case 'dashboard.brickLabelChanged': {
          const { instanceId, label } = event.payload as {
            instanceId: string;
            label?: string;
          };
          store.updateBrickLabel(instanceId, label);
          break;
        }
        case 'dashboard.brickConfigChanged': {
          const { instanceId, config } = event.payload as {
            instanceId: string;
            config: Record<string, Json>;
          };
          store.updateBrickConfig(instanceId, config);
          break;
        }
      }
    });

    // EventSource auto-reconnects on error; heartbeat on server detects stale connections
    es.onerror = () => {};

    return () => {
      aborted = true;
      es.close();
    };
  }, [dashboardId, qc]);
}
