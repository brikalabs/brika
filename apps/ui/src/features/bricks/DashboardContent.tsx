import { useParams } from '@tanstack/react-router';
import { LayoutGrid, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Button, Skeleton } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { DashboardGrid } from './components/DashboardGrid';
import { useDashboardSSE, useLoadDashboard, useSaveLayout } from './hooks';
import { useActiveDashboard, useDashboardStore } from './store';

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={`grid-skeleton-${i}`} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

export function DashboardContent() {
  const { t } = useLocale();
  const { dashboardId } = useParams({ strict: false });

  // Sync route param → store (for mutations that read activeDashboardId).
  // Also clear per-instance data when the dashboard changes.
  const prevIdRef = useRef(dashboardId);
  useEffect(() => {
    if (!dashboardId) return;

    const changed = prevIdRef.current !== dashboardId;
    prevIdRef.current = dashboardId;

    useDashboardStore.setState({ activeDashboardId: dashboardId });

    if (changed) {
      useDashboardStore.setState({
        bodies: new Map(),
        disconnectedInstances: new Set(),
      });
    }
  }, [dashboardId]);

  // Per-dashboard data loading and SSE
  const { data: loadedDashboard, isLoading } = useLoadDashboard(dashboardId);
  useDashboardSSE(dashboardId);

  // Sync query data → store (covers cache hits where queryFn doesn't re-run)
  useEffect(() => {
    if (loadedDashboard) {
      useDashboardStore.getState().setActiveDashboard(loadedDashboard);
    }
  }, [loadedDashboard]);

  const dashboard = useActiveDashboard();
  const saveLayout = useSaveLayout();
  const setAddBrickOpen = useDashboardStore((s) => s.setAddBrickOpen);
  const handleAddBrick = useCallback(() => setAddBrickOpen(true), [setAddBrickOpen]);

  if (!dashboardId) return null;

  const brickCount = dashboard?.bricks.length ?? 0;
  const hasBricks = brickCount > 0;

  if (isLoading) return <GridSkeleton />;

  if (!hasBricks) {
    return (
      <div className="py-12 text-center">
        <LayoutGrid className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h3 className="font-semibold">{t('bricks:empty')}</h3>
        <p className="mt-1 text-muted-foreground">{t('bricks:emptyHint')}</p>
        <Button variant="outline" className="mt-4" onClick={handleAddBrick}>
          <Plus className="mr-1.5 size-4" />
          {t('bricks:addFirstBrick')}
        </Button>
      </div>
    );
  }

  if (!dashboard) return null;

  return <DashboardGrid dashboard={dashboard} onSaveLayout={saveLayout} />;
}
