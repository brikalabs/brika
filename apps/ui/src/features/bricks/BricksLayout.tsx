import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { AddBrickSheet } from './components/AddBrickSheet';
import { ConfigSheet } from './components/ConfigSheet';
import { DashboardSwitcher } from './components/DashboardSwitcher';
import { EditDashboardDialog } from './components/EditDashboardDialog';
import { useBrickTypesList, useDashboards } from './hooks';
import { useActiveDashboard, useDashboardStore } from './store';

export function BricksLayout() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { dashboardId } = useParams({ strict: false });

  // ─── Data shared across all dashboards ──────────────────────────────────────
  const { data: dashboards = [], isLoading: dashboardsLoading } = useDashboards();
  useBrickTypesList();

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

  // ─── UI chrome state ────────────────────────────────────────────────────────
  const dashboard = useActiveDashboard();
  const setAddBrickOpen = useDashboardStore((s) => s.setAddBrickOpen);
  const [editOpen, setEditOpen] = useState(false);

  const handleAddBrick = useCallback(() => setAddBrickOpen(true), [setAddBrickOpen]);

  const brickCount = dashboard?.bricks.length ?? 0;

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
            {dashboard && (
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
      <DashboardSwitcher onEdit={() => setEditOpen(true)} />

      {/* Child route renders here */}
      <Outlet />

      {/* Sheets (driven by store state, shared across dashboards) */}
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
