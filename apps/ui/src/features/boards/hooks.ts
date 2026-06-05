import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { getStreamUrl } from '@/lib/query';
import type { Json } from '@/types';
import type { BoardSummary } from './api';
import { boardKeys, boardsApi, brickTypesApi } from './api';
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
      if (!boardId) {
        throw new Error('No board ID');
      }
      const data = await boardsApi.get(boardId);
      setActiveBoard(data);
      return data;
    },
    enabled: !!boardId,
  });
}

/**
 * In-flight brick-data fetches, keyed by board id. Shared across the
 * board-level mount hook and the per-brick hydration so that mounting N bricks
 * (or remounting a board) coalesces into a single REST request instead of N.
 * The promise is removed once it settles, allowing a later refresh to re-fetch.
 */
const brickDataInFlight = new Map<string, Promise<void>>();

/**
 * Fetch the current brick-data snapshot for a board and write it into the
 * store, deduplicating concurrent callers. Whichever caller arrives first
 * starts the request; later callers await the same promise. Both this and the
 * per-board SSE replay write the same store keys, so whichever lands first wins
 * and the other is a harmless no-op overwrite of identical data.
 */
export function hydrateBrickData(boardId: string, reason: string): Promise<void> {
  const existing = brickDataInFlight.get(boardId);
  if (existing) {
    return existing;
  }
  const request = boardsApi
    .brickData(boardId)
    .then(({ entries }) => {
      console.info(
        `[boards] hydrated ${entries.length} brick-data entr${entries.length === 1 ? 'y' : 'ies'} for board ${boardId} (${reason})`
      );
      useBoardStore.getState().setBrickDataBatch(entries);
    })
    .catch((error: unknown) => {
      console.warn(`[boards] failed to hydrate brick-data for board ${boardId} (${reason})`, error);
    })
    .finally(() => {
      brickDataInFlight.delete(boardId);
    });
  brickDataInFlight.set(boardId, request);
  return request;
}

/**
 * Hydrate current brick data on board mount via a REST snapshot.
 *
 * The per-board SSE already replays a `brick.dataSnapshot` on connect, but
 * that ties data delivery to SSE connect timing. Fetching the same snapshot
 * over REST on mount makes a freshly-loaded/refreshed board deterministically
 * receive the current values right away, so a slow-polling plugin (e.g.
 * weather) never leaves a card stuck on a bare spinner waiting for the next
 * push.
 */
export function useBrickDataSnapshot(boardId: string | undefined) {
  useEffect(() => {
    if (!boardId) {
      return;
    }
    hydrateBrickData(boardId, 'board mount');
  }, [boardId]);
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
  const capture = useCapture();

  return useMutation({
    mutationFn: (args: { name: string; icon?: string }) => boardsApi.create(args.name, args.icon),
    onSuccess: (board) => {
      capture('board.created', { boardId: board.id });
      qc.invalidateQueries({
        queryKey: boardKeys.all,
      });
    },
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  const capture = useCapture();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        icon?: string;
      };
    }) => boardsApi.update(id, data),
    onSuccess: (updated) => {
      capture('board.updated', { boardId: updated.id });
      const store = useBoardStore.getState();
      if (store.activeBoardId === updated.id) {
        store.setActiveBoard(updated);
      }
      qc.invalidateQueries({
        queryKey: boardKeys.all,
      });
      qc.invalidateQueries({
        queryKey: boardKeys.detail(updated.id),
      });
    },
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  const capture = useCapture();

  return useMutation({
    mutationFn: (id: string) => boardsApi.delete(id),
    onSuccess: (_data, id) => {
      capture('board.deleted', { boardId: id });
      qc.invalidateQueries({
        queryKey: boardKeys.all,
      });
    },
  });
}

export function useReorderBoards() {
  const qc = useQueryClient();
  const capture = useCapture();

  return useMutation({
    mutationFn: (ids: string[]) => boardsApi.reorder(ids),
    onSuccess: (_data, ids) => {
      capture('board.reordered', { count: ids.length });
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({
        queryKey: boardKeys.all,
      });
      const previous = qc.getQueryData<BoardSummary[]>(boardKeys.all);
      if (previous) {
        const byId = new Map(previous.map((b) => [b.id, b]));
        const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as BoardSummary[];
        qc.setQueryData(boardKeys.all, reordered);
        useBoardStore.getState().setBoards(reordered);
      }
      return {
        previous,
      };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        qc.setQueryData(boardKeys.all, context.previous);
        useBoardStore.getState().setBoards(context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: boardKeys.all,
      });
    },
  });
}

// ─── Board mutations ───────────────────────────────────────────────────

export function useAddBrick() {
  const qc = useQueryClient();
  const capture = useCapture();

  return useMutation({
    mutationFn: (args: {
      brickTypeId: string;
      config?: Record<string, unknown>;
      position?: {
        x: number;
        y: number;
      };
      size?: {
        w: number;
        h: number;
      };
    }) => {
      const boardId = useBoardStore.getState().activeBoardId;
      if (!boardId) {
        throw new Error('No active board');
      }
      return boardsApi.addBrick(boardId, args.brickTypeId, args.config, args.position, args.size);
    },
    onSuccess: (placement, args) => {
      capture('brick.added', { brickTypeId: args.brickTypeId });
      useBoardStore.getState().addBrickPlacement(placement);
      // Only invalidate the board list (for brickCount), not the detail query.
      // The detail is already updated optimistically via addBrickPlacement.
      qc.invalidateQueries({
        queryKey: boardKeys.all,
        exact: true,
      });
    },
  });
}

export function useRemoveBrick() {
  const qc = useQueryClient();
  const capture = useCapture();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const boardId = useBoardStore.getState().activeBoardId;
      if (!boardId) {
        throw new Error('No active board');
      }
      await boardsApi.removeBrick(boardId, instanceId);
      return instanceId;
    },
    onSuccess: (instanceId) => {
      capture('brick.removed', { instanceId });
      useBoardStore.getState().removeBrickPlacement(instanceId);
      // Only invalidate the board list (for brickCount), not the detail query.
      qc.invalidateQueries({
        queryKey: boardKeys.all,
        exact: true,
      });
    },
  });
}

export function useRenameBrick() {
  const capture = useCapture();

  return useMutation({
    mutationFn: ({ instanceId, label }: { instanceId: string; label: string | undefined }) => {
      const boardId = useBoardStore.getState().activeBoardId;
      if (!boardId) {
        throw new Error('No active board');
      }
      return boardsApi.updateBrick(boardId, instanceId, {
        label: label ?? '',
      });
    },
    onSuccess: (_, { instanceId, label }) => {
      capture('brick.renamed', { instanceId });
      useBoardStore.getState().updateBrickLabel(instanceId, label);
    },
  });
}

export function useSaveLayout() {
  return useCallback(
    (
      layouts: Array<{
        instanceId: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }>
    ) => {
      const store = useBoardStore.getState();
      if (!store.activeBoardId) {
        return;
      }
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
    if (!boardId) {
      return;
    }

    let aborted = false;
    const es = new EventSource(getStreamUrl(`/api/boards/${boardId}/sse`));

    es.addEventListener('board', (ev: MessageEvent) => {
      if (aborted) {
        return;
      }

      let event: {
        type: string;
        payload: Record<string, unknown>;
      };
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      const store = useBoardStore.getState();

      switch (event.type) {
        case 'brick.dataSnapshot': {
          const entries = event.payload.entries as Array<[string, unknown]>;
          store.setBrickDataBatch(entries);
          break;
        }
        case 'brick.dataUpdated': {
          const { brickTypeId, data } = event.payload as {
            brickTypeId: string;
            data: unknown;
          };
          store.setBrickData(brickTypeId, data);
          break;
        }
        case 'brick.moduleRecompiled': {
          const { brickTypeId, moduleUrl } = event.payload as {
            brickTypeId: string;
            moduleUrl: string;
          };
          // Remove old injected <style> so the new module can inject fresh CSS
          const bt = store.brickTypes.get(brickTypeId);
          if (bt) {
            const cssKey = `${bt.pluginName}:bricks/${bt.localId}`;
            document.querySelector(`style[data-brika-css="${cssKey}"]`)?.remove();
          }
          store.updateBrickTypeModuleUrl(brickTypeId, moduleUrl);
          break;
        }
        case 'board.brickAdded':
        case 'board.brickRemoved':
          qc.invalidateQueries({
            queryKey: boardKeys.all,
            exact: true,
          });
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
