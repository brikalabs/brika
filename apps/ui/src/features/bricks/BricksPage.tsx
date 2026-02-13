import { useNavigate, useParams } from '@tanstack/react-router';
import { LayoutGrid, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Skeleton } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { AddBrickSheet } from './components/AddBrickSheet';
import { ConfigSheet } from './components/ConfigSheet';
import { DashboardGrid } from './components/DashboardGrid';
import { DashboardSwitcher } from './components/DashboardSwitcher';
import { EditDashboardDialog } from './components/EditDashboardDialog';
import {
  useBrickStream,
  useBrickTypesList,
  useDashboardStream,
  useDashboards,
  useLoadDashboard,
  useSaveLayout,
} from './hooks';
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

export function BricksPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { dashboardId } = useParams({ strict: false }) as { dashboardId?: string };

  // ─── Data fetching ────────────────────────────────────────────────────────
  const { data: dashboards = [], isLoading: dashboardsLoading } = useDashboards();
  useBrickTypesList();

  // Sync route param → store
  useEffect(() => {
    if (dashboardId) {
      useDashboardStore.setState({ activeDashboardId: dashboardId });
    }
  }, [dashboardId]);

  // Auto-redirect /bricks → /bricks/{first}
  useEffect(() => {
    if (!dashboardId && !dashboardsLoading && dashboards.length > 0) {
      navigate({
        to: '/bricks/$dashboardId',
        params: { dashboardId: dashboards[0].id },
        replace: true,
      });
    }
  }, [dashboardId, dashboards, dashboardsLoading, navigate]);

  const { isLoading: dashboardLoading } = useLoadDashboard(dashboardId ?? null);

  // ─── SSE streams ──────────────────────────────────────────────────────────
  useBrickStream();
  useDashboardStream();

  // ─── State ────────────────────────────────────────────────────────────────
  const dashboard = useActiveDashboard();
  const setAddBrickOpen = useDashboardStore((s) => s.setAddBrickOpen);
  const saveLayout = useSaveLayout();
  const [editOpen, setEditOpen] = useState(false);

  const handleAddBrick = useCallback(() => setAddBrickOpen(true), [setAddBrickOpen]);

  const brickCount = dashboard?.bricks.length ?? 0;
  const isLoading = dashboardsLoading || dashboardLoading;
  const hasBricks = brickCount > 0;

  // ─── Navigation ─────────────────────────────────────────────────────────
  // Avoid useDataView here — it recreates component types when `data` reference
  // changes, which causes the entire tree (grid, SSE connections, video players)
  // to unmount and remount on every layout update.

  const handleSelectDashboard = useCallback(
    (id: string) => {
      navigate({ to: '/bricks/$dashboardId', params: { dashboardId: id } });
    },
    [navigate]
  );

  const handleDashboardDeleted = useCallback(() => {
    const remaining = dashboards.filter((d) => d.id !== dashboardId);
    if (remaining.length > 0) {
      navigate({
        to: '/bricks/$dashboardId',
        params: { dashboardId: remaining[0].id },
        replace: true,
      });
    } else {
      navigate({ to: '/bricks', replace: true });
    }
  }, [dashboards, dashboardId, navigate]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {dashboard?.name ?? t('bricks:title')}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('bricks:subtitle')}
            {!isLoading && dashboard && (
              <span className="ml-2 font-medium">
                · {brickCount} {t('common:items.brick', { count: brickCount }).toLowerCase()}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleAddBrick}>
          <Plus className="mr-1.5 size-4" />
          {t('bricks:addBrick')}
        </Button>
      </div>

      {/* Dashboard switcher */}
      <DashboardSwitcher
        activeDashboardId={dashboardId ?? null}
        onSelect={handleSelectDashboard}
        onEdit={() => setEditOpen(true)}
      />

      {/* Grid */}
      {isLoading && <GridSkeleton />}
      {!isLoading && !hasBricks && (
        <div className="py-12 text-center">
          <LayoutGrid className="mx-auto mb-4 size-12 text-muted-foreground" />
          <h3 className="font-semibold">{t('bricks:empty')}</h3>
          <p className="mt-1 text-muted-foreground">{t('bricks:emptyHint')}</p>
          <Button variant="outline" className="mt-4" onClick={handleAddBrick}>
            <Plus className="mr-1.5 size-4" />
            {t('bricks:addFirstBrick')}
          </Button>
        </div>
      )}
      {!isLoading && hasBricks && dashboard && (
        <DashboardGrid dashboard={dashboard} onSaveLayout={saveLayout} />
      )}

      {/* Sheets */}
      <AddBrickSheet />
      <ConfigSheet />

      {/* Edit dashboard dialog */}
      {dashboard && (
        <EditDashboardDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          dashboard={dashboard}
          onDeleted={handleDashboardDeleted}
        />
      )}
    </div>
  );
}
