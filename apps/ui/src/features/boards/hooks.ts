import type { Json } from '@brika/shared';
import type { ComponentNode, Mutation } from '@brika/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { getStreamUrl } from '@/lib/query';
import type { BoardSummary } from './api';
import { brickInstancesApi, brickTypesApi, dashboardKeys, dashboardsApi } from './api';
import { useBoardStore } from './store';

// ─── Data fetching ─────────────────────────────────────────────────────────

export function useBoards() {
  const setBoards = useBoardStore((s) => s.setBoards);

  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: async () => {
      const data = await dashboardsApi.list();
      setBoards(data);
      return data;
    },
  });
}

export function useLoadBoard(dashboardId: string | undefined) {
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);

  return useQuery({
    queryKey: dashboardKeys.detail(dashboardId ?? ''),
    queryFn: async () => {
      if (!dashboardId) throw new Error('No dashboard ID');
      const data = await dashboardsApi.get(dashboardId);
      setActiveBoard(data);
      return data;
    },
    enabled: !!dashboardId,
  });
}

export function useBrickTypesList() {
  const setBrickTypes = useBoardStore((s) => s.setBrickTypes);

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

export function useCreateBoard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: { name: string; icon?: string }) =>
      dashboardsApi.create(args.name, args.icon),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; icon?: string } }) =>
      dashboardsApi.update(id, data),
    onSuccess: (updated) => {
      const store = useBoardStore.getState();
      if (store.activeBoardId === updated.id) {
        store.setActiveBoard(updated);
      }
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.detail(updated.id) });
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dashboardsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useReorderBoards() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => dashboardsApi.reorder(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: dashboardKeys.all });
      const previous = qc.getQueryData<BoardSummary[]>(dashboardKeys.all);
      if (previous) {
        const byId = new Map(previous.map((b) => [b.id, b]));
        const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as BoardSummary[];
        qc.setQueryData(dashboardKeys.all, reordered);
        useBoardStore.getState().setBoards(reordered);
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(dashboardKeys.all, context.previous);
        useBoardStore.getState().setBoards(context.previous);
      }
    },
    onSettled: () => {
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
      const dashboardId = useBoardStore.getState().activeBoardId;
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
      useBoardStore.getState().addBrickPlacement(placement);
      useBoardStore.getState().setInstanceBody(placement.instanceId, []);
      // Only invalidate the dashboard list (for brickCount), not the detail query.
      // The detail is already updated optimistically via addBrickPlacement.
      qc.invalidateQueries({ queryKey: dashboardKeys.all, exact: true });

      // Safety net: fetch the body from API after plugin has had time to render.
      setTimeout(() => {
        brickInstancesApi
          .get(placement.instanceId)
          .then((inst) => {
            if (inst.body.length > 0) {
              useBoardStore.getState().setInstanceBody(inst.instanceId, inst.body);
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
      const dashboardId = useBoardStore.getState().activeBoardId;
      if (!dashboardId) throw new Error('No active dashboard');
      await dashboardsApi.removeBrick(dashboardId, instanceId);
      return instanceId;
    },
    onSuccess: (instanceId) => {
      useBoardStore.getState().removeBrickPlacement(instanceId);
      useBoardStore.getState().removeInstanceBody(instanceId);
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
      const dashboardId = useBoardStore.getState().activeBoardId;
      if (!dashboardId) throw new Error('No active dashboard');
      return dashboardsApi.updateBrick(dashboardId, instanceId, { label: label ?? '' });
    },
    onSuccess: (_, { instanceId, label }) => {
      useBoardStore.getState().updateBrickLabel(instanceId, label);
    },
  });
}

export function useSaveLayout() {
  return useCallback(
    (layouts: Array<{ instanceId: string; x: number; y: number; w: number; h: number }>) => {
      const store = useBoardStore.getState();
      if (!store.activeBoardId) return;
      store.updateBrickLayouts(layouts);
      dashboardsApi.batchLayout(store.activeBoardId, layouts);
    },
    []
  );
}

// ─── SSE streams ───────────────────────────────────────────────────────────

export function useBoardSSE(dashboardId: string | undefined) {
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
      const store = useBoardStore.getState();

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
