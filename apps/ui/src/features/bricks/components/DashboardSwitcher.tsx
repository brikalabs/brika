import { Link, useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, Pencil, Plus } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useCreateDashboard, useDashboards } from '../hooks';

interface DashboardSwitcherProps {
  onEdit: () => void;
}

export function DashboardSwitcher({ onEdit }: Readonly<DashboardSwitcherProps>) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { data: dashboards = [] } = useDashboards();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { mutate: createDashboard, isPending: creating } = useCreateDashboard();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createDashboard(
      { name: newName.trim() },
      {
        onSuccess: (dashboard) => {
          setCreateOpen(false);
          setNewName('');
          navigate({ to: '/bricks/$dashboardId', params: { dashboardId: dashboard.id } });
        },
      }
    );
  };

  return (
    <>
      <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
        {dashboards.map((d) => (
          <Link
            key={d.id}
            to="/bricks/$dashboardId"
            params={{ dashboardId: d.id }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
            activeProps={{ className: 'bg-background font-medium shadow-sm' }}
            inactiveProps={{ className: 'text-muted-foreground hover:text-foreground' }}
          >
            {d.icon ? (
              <DynamicIcon name={d.icon as IconName} className="size-3.5" />
            ) : (
              <LayoutDashboard className="size-3.5" />
            )}
            {d.name}
          </Link>
        ))}

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Edit active dashboard */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onEdit}
              disabled={dashboards.length === 0}
            >
              <Pencil className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('bricks:dashboard.edit')}</TooltipContent>
        </Tooltip>

        {/* Create new dashboard */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('bricks:dashboard.new')}</TooltipContent>
        </Tooltip>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bricks:dashboard.new')}</DialogTitle>
            <DialogDescription>{t('bricks:dashboard.newDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dashboard-name">{t('common:labels.name')}</Label>
            <Input
              id="dashboard-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Dashboard"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? t('common:messages.loading') : t('common:actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
