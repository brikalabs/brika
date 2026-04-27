import { Button, Skeleton } from '@brika/clay';
import { useParams } from '@tanstack/react-router';
import { LayoutGrid, Plus } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useLocale } from '@/lib/use-locale';
import { BoardGrid } from './components/BoardGrid';
import { useBoardSSE, useLoadBoard, useSaveLayout } from './hooks';
import { useActiveBoard, useBoardStore } from './store';

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
        <Skeleton key={id} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

export function BoardContent() {
  const { t } = useLocale();
  const { boardId } = useParams({
    strict: false,
  });

  // Sync route param → store (for mutations that read activeBoardId).
  useEffect(() => {
    if (!boardId) {
      return;
    }

    useBoardStore.setState({
      activeBoardId: boardId,
    });
  }, [boardId]);

  // Per-board data loading and SSE
  const { data: loadedBoard, isLoading } = useLoadBoard(boardId);
  useBoardSSE(boardId);

  // Sync query data → store (covers cache hits where queryFn doesn't re-run)
  useEffect(() => {
    if (loadedBoard) {
      useBoardStore.getState().setActiveBoard(loadedBoard);
    }
  }, [loadedBoard]);

  const board = useActiveBoard();
  const saveLayout = useSaveLayout();
  const setAddBrickOpen = useBoardStore((s) => s.setAddBrickOpen);
  const handleAddBrick = useCallback(() => setAddBrickOpen(true), [setAddBrickOpen]);

  if (!boardId) {
    return null;
  }

  const brickCount = board?.bricks.length ?? 0;
  const hasBricks = brickCount > 0;

  if (isLoading) {
    return <GridSkeleton />;
  }

  if (!hasBricks) {
    return (
      <div className="py-12 text-center">
        <LayoutGrid className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h3 className="font-semibold">{t('boards:empty')}</h3>
        <p className="mt-1 text-muted-foreground">{t('boards:emptyHint')}</p>
        <Button variant="outline" className="mt-4" onClick={handleAddBrick}>
          <Plus className="mr-1.5 size-4" />
          {t('boards:addFirstBrick')}
        </Button>
      </div>
    );
  }

  if (!board) {
    return null;
  }

  return <BoardGrid board={board} onSaveLayout={saveLayout} />;
}
