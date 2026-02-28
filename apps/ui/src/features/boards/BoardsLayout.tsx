import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { routes } from '@/routes';
import type { BoardSummary } from './api';
import { AddBrickSheet } from './components/AddBrickSheet';
import { BoardSwitcher } from './components/BoardSwitcher';
import { ConfigSheet } from './components/ConfigSheet';
import { EditBoardDialog } from './components/EditBoardDialog';
import { useBoards, useBrickTypesList } from './hooks';
import { useActiveBoard, useBoardStore } from './store';

export function BoardsLayout() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { boardId } = useParams({ strict: false });

  // ─── Data shared across all boards ──────────────────────────────────────
  const { data: boards = [], isLoading: boardsLoading } = useBoards();
  useBrickTypesList();

  // Auto-redirect /boards → /boards/{first}
  useEffect(() => {
    if (!boardId && !boardsLoading && boards.length > 0) {
      navigate({
        to: routes.boards.detail.to({ boardId: boards[0].id }),
        replace: true,
      });
    }
  }, [boardId, boards, boardsLoading, navigate]);

  // ─── UI chrome state ────────────────────────────────────────────────────────
  const board = useActiveBoard();
  const setAddBrickOpen = useBoardStore((s) => s.setAddBrickOpen);
  const [editBoard, setEditBoard] = useState<BoardSummary | null>(null);

  const handleAddBrick = useCallback(() => setAddBrickOpen(true), [setAddBrickOpen]);

  const brickCount = board?.bricks.length ?? 0;

  const handleBoardDeleted = useCallback(() => {
    const deletedId = editBoard?.id;
    setEditBoard(null);
    const remaining = boards.filter((d) => d.id !== deletedId);
    if (remaining.length > 0) {
      navigate({
        to: routes.boards.detail.to({ boardId: remaining[0].id }),
        replace: true,
      });
    } else {
      navigate({ to: routes.boards.list.path, replace: true });
    }
  }, [boards, editBoard?.id, navigate]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {board?.name ?? t('boards:title')}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('boards:subtitle')}
            {board && (
              <span className="ml-2 font-medium">
                · {brickCount} {t('common:items.brick', { count: brickCount }).toLowerCase()}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleAddBrick}>
          <Plus className="mr-1.5 size-4" />
          {t('boards:addBrick')}
        </Button>
      </div>

      {/* Board switcher */}
      <BoardSwitcher onEdit={setEditBoard} />

      {/* Child route renders here */}
      <Outlet />

      {/* Sheets (driven by store state, shared across boards) */}
      <AddBrickSheet />
      <ConfigSheet />

      {/* Edit board dialog */}
      {editBoard && (
        <EditBoardDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditBoard(null);
          }}
          board={editBoard}
          onDeleted={handleBoardDeleted}
        />
      )}
    </div>
  );
}
