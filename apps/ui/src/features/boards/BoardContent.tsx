import { useParams } from '@tanstack/react-router';
import { LayoutGrid, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Button, Skeleton } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { BoardGrid } from './components/BoardGrid';
import { useBoardSSE, useLoadBoard, useSaveLayout } from './hooks';
import { useActiveBoard, useBoardStore } from './store';

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={`grid-skeleton-${i}`} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

export function BoardContent() {
  const { t } = useLocale();
  const { dashboardId } = useParams({ strict: false });

  // Sync route param → store (for mutations that read activeDashboardId).
  // Also clear per-instance data when the dashboard changes.
  const prevIdRef = useRef(dashboardId);
  useEffect(() => {
    if (!dashboardId) return;

    const changed = prevIdRef.current !== dashboardId;
    prevIdRef.current = dashboardId;

    useBoardStore.setState({ activeBoardId: dashboardId });

    if (changed) {
      useBoardStore.setState({
        bodies: new Map(),
        disconnectedInstances: new Set(),
      });
    }
  }, [dashboardId]);

  // Per-dashboard data loading and SSE
  const { data: loadedDashboard, isLoading } = useLoadBoard(dashboardId);
  useBoardSSE(dashboardId);

  // Sync query data → store (covers cache hits where queryFn doesn't re-run)
  useEffect(() => {
    if (loadedDashboard) {
      useBoardStore.getState().setActiveBoard(loadedDashboard);
    }
  }, [loadedDashboard]);

  const dashboard = useActiveBoard();
  const saveLayout = useSaveLayout();
  const setAddBrickOpen = useBoardStore((s) => s.setAddBrickOpen);
  const handleAddBrick = useCallback(() => setAddBrickOpen(true), [setAddBrickOpen]);

  if (!dashboardId) return null;

  const brickCount = dashboard?.bricks.length ?? 0;
  const hasBricks = brickCount > 0;

  if (isLoading) return <GridSkeleton />;

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

  if (!dashboard) return null;

  return <BoardGrid dashboard={dashboard} onSaveLayout={saveLayout} />;
}
