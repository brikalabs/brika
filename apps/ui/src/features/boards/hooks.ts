import type { ComponentNode, Mutation } from '@brika/ui-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { getStreamUrl } from '@/lib/query';
import type { Json } from '@/types';
import type { BoardSummary } from './api';
import { boardKeys, boardsApi, brickInstancesApi, brickTypesApi } from './api';
import { useBoardStore } from './store';

// ─── Data fetching ─────────────────────────────────────────────────────────

export function useBoards() {
  const setBoards = useBoardStore((s) => s.setBoards);

  return useQuery({
    queryKey: boardKeys.all,
    queryFn: async () => {
      const data = await boardsApi.list();
      setBoards(data);
      return data;
    },
  });
}

export function useLoadBoard(boardId: string | undefined) {
  const setActiveBoard = useBoardStore((s) => s.setActiveBoard);

  return useQuery({
    queryKey: boardKeys.detail(boardId ?? ''),
    queryFn: async () => {
      if (!boardId) throw new Error('No board ID');
      const data = await boardsApi.get(boardId);
      setActiveBoard(data);
      return data;
    },
    enabled: !!boardId,
  });
}

export function useBrickTypesList() {
  const setBrickTypes = useBoardStore((s) => s.setBrickTypes);

  return useQuery({
    queryKey: boardKeys.brickTypes,
    queryFn: async () => {
      const data = await brickTypesApi.list();
      setBrickTypes(data);
      return data;
    },
  });
}

// ─── Board CRUD mutations ───────────────────────────────────────────────

export function useCreateBoard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: { name: string; icon?: string }) => boardsApi.create(args.name, args.icon),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; icon?: string } }) =>
      boardsApi.update(id, data),
    onSuccess: (updated) => {
      const store = useBoardStore.getState();
      if (store.activeBoardId === updated.id) {
        store.setActiveBoard(updated);
      }
      qc.invalidateQueries({ queryKey: boardKeys.all });
      qc.invalidateQueries({ queryKey: boardKeys.detail(updated.id) });
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => boardsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.all });
    },
  });
}

export function useReorderBoards() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => boardsApi.reorder(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: boardKeys.all });
      const previous = qc.getQueryData<BoardSummary[]>(boardKeys.all);
      if (previous) {
        const byId = new Map(previous.map((b) => [b.id, b]));
        const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as BoardSummary[];
        qc.setQueryData(boardKeys.all, reordered);
        useBoardStore.getState().setBoards(reordered);
      }
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(boardKeys.all, context.previous);
        useBoardStore.getState().setBoards(context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardKeys.all });
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

// ─── Board mutations ───────────────────────────────────────────────────

export function useAddBrick() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      brickTypeId: string;
      config?: Record<string, unknown>;
      position?: { x: number; y: number };
      size?: { w: number; h: number };
    }) => {
      const boardId = useBoardStore.getState().activeBoardId;
      if (!boardId) throw new Error('No active board');
      return boardsApi.addBrick(boardId, args.brickTypeId, args.config, args.position, args.size);
    },
    onSuccess: (placement) => {
      useBoardStore.getState().addBrickPlacement(placement);
      useBoardStore.getState().setInstanceBody(placement.instanceId, []);
      // Only invalidate the board list (for brickCount), not the detail query.
      // The detail is already updated optimistically via addBrickPlacement.
      qc.invalidateQueries({ queryKey: boardKeys.all, exact: true });

      // Safety net: fetch the body from API after plugin has had time to render.
      setTimeout(() => {
        brickInstancesApi
          .get(placement.instanceId)
          .then((inst) => {
            if (inst.body.length > 0) {
              useBoardStore.getState().setInstanceBody(inst.instanceId, inst.body);
            }
          })
          .catch(() => {
            // Ignore delayed body refresh errors.
          });
      }, 500);
    },
  });
}

export function useRemoveBrick() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const boardId = useBoardStore.getState().activeBoardId;
      if (!boardId) throw new Error('No active board');
      await boardsApi.removeBrick(boardId, instanceId);
      return instanceId;
    },
    onSuccess: (instanceId) => {
      useBoardStore.getState().removeBrickPlacement(instanceId);
      useBoardStore.getState().removeInstanceBody(instanceId);
      // Only invalidate the board list (for brickCount), not the detail query.
      qc.invalidateQueries({ queryKey: boardKeys.all, exact: true });
    },
  });
}

export function useRenameBrick() {
  return useMutation({
    mutationFn: ({ instanceId, label }: { instanceId: string; label: string | undefined }) => {
      const boardId = useBoardStore.getState().activeBoardId;
      if (!boardId) throw new Error('No active board');
      return boardsApi.updateBrick(boardId, instanceId, { label: label ?? '' });
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
      boardsApi.batchLayout(store.activeBoardId, layouts);
    },
    []
  );
}

// ─── SSE streams ───────────────────────────────────────────────────────────

export function useBoardSSE(boardId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!boardId) return;

    let aborted = false;
    const es = new EventSource(getStreamUrl(`/api/boards/${boardId}/sse`));

    es.addEventListener('board', (ev: MessageEvent) => {
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
        case 'board.brickAdded':
        case 'board.brickRemoved':
          qc.invalidateQueries({ queryKey: boardKeys.all, exact: true });
          break;
        case 'board.layoutChanged': {
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
        case 'board.brickLabelChanged': {
          const { instanceId, label } = event.payload as {
            instanceId: string;
            label?: string;
          };
          store.updateBrickLabel(instanceId, label);
          break;
        }
        case 'board.brickConfigChanged': {
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
    es.onerror = () => {
      // Intentionally empty: EventSource will retry automatically.
    };

    return () => {
      aborted = true;
      es.close();
    };
  }, [boardId, qc]);
}
