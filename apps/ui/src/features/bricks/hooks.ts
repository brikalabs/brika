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

export function useLoadDashboard(dashboardId: string | null) {
  const setActiveDashboard = useDashboardStore((s) => s.setActiveDashboard);

  return useQuery({
    queryKey: dashboardKeys.detail(dashboardId ?? ''),
    queryFn: async () => {
      const data = await dashboardsApi.get(dashboardId!);
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

export function useBrickStream() {
  useEffect(() => {
    const es = new EventSource(getStreamUrl('/api/stream/bricks'));

    es.addEventListener('brick', (ev: MessageEvent) => {
      const event = JSON.parse(ev.data) as {
        type: string;
        payload: Record<string, unknown>;
      };

      switch (event.type) {
        case 'brick.snapshot': {
          const instances = event.payload.instances as Array<{
            instanceId: string;
            body: ComponentNode[];
          }>;
          useDashboardStore.getState().setBodiesBatch(instances.map((i) => [i.instanceId, i.body]));
          break;
        }
        case 'brick.instancePatched': {
          const instanceId = event.payload.instanceId as string;
          const mutations = event.payload.mutations as Mutation[];
          useDashboardStore.getState().patchInstance(instanceId, mutations);
          break;
        }
        case 'brick.instanceMounted': {
          const instanceId = event.payload.instanceId as string;
          useDashboardStore.getState().setInstanceBody(instanceId, []);
          break;
        }
      }
    });

    return () => es.close();
  }, []);
}

export function useDashboardStream() {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource(getStreamUrl('/api/stream/dashboards'));

    es.addEventListener('dashboard', (ev: MessageEvent) => {
      const event = JSON.parse(ev.data) as {
        type: string;
        payload: Record<string, unknown>;
      };

      switch (event.type) {
        case 'dashboard.created':
        case 'dashboard.deleted':
          qc.invalidateQueries({ queryKey: dashboardKeys.all, exact: true });
          break;
        case 'dashboard.brickAdded':
        case 'dashboard.brickRemoved': {
          // Already handled optimistically by addBrickPlacement / removeBrickPlacement.
          // Only refresh the dashboard list for brickCount display.
          qc.invalidateQueries({ queryKey: dashboardKeys.all, exact: true });
          break;
        }
        case 'dashboard.layoutChanged': {
          const layouts = event.payload.layouts as Array<{
            instanceId: string;
            x: number;
            y: number;
            w: number;
            h: number;
          }>;
          useDashboardStore.getState().updateBrickLayouts(layouts);
          break;
        }
        case 'dashboard.brickConfigChanged': {
          const { instanceId, config } = event.payload as {
            instanceId: string;
            config: Record<string, Json>;
          };
          useDashboardStore.getState().updateBrickConfig(instanceId, config);
          break;
        }
      }
    });

    return () => es.close();
  }, [qc]);
}
