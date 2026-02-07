import { LayoutDashboard, Search, Trash2 } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ScrollArea,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { Dashboard } from '../api';
import { useDeleteDashboard, useUpdateDashboard } from '../hooks';

// Curated set of icons suitable for dashboards
const ICON_OPTIONS: string[] = [
  // Layout & Dashboard
  'layout-dashboard',
  'layout-grid',
  'layout-list',
  'columns-3',
  'grid-3x3',
  'panel-top',
  // Home & Navigation
  'home',
  'compass',
  'map',
  'map-pin',
  'navigation',
  'signpost',
  // Charts & Analytics
  'chart-bar',
  'chart-line',
  'chart-pie',
  'chart-area',
  'trending-up',
  'trending-down',
  'activity',
  'bar-chart-3',
  'gauge',
  'percent',
  // Time
  'clock',
  'timer',
  'calendar',
  'alarm-clock',
  'hourglass',
  // Notifications & Communication
  'bell',
  'mail',
  'message-circle',
  'phone',
  'globe',
  'radio',
  'megaphone',
  'rss',
  // Media
  'camera',
  'image',
  'video',
  'music',
  'headphones',
  'mic',
  'tv',
  'film',
  // Tech
  'monitor',
  'cpu',
  'server',
  'database',
  'hard-drive',
  'wifi',
  'smartphone',
  'tablet',
  // Weather & Nature
  'cloud',
  'sun',
  'moon',
  'thermometer',
  'droplet',
  'leaf',
  'flower',
  'mountain',
  // Commerce
  'shopping-cart',
  'shopping-bag',
  'credit-card',
  'wallet',
  'receipt',
  'tag',
  // Energy
  'zap',
  'battery',
  'plug',
  'flame',
  'power',
  'lightbulb',
  // People & Security
  'user',
  'users',
  'shield',
  'lock',
  'key',
  'eye',
  'fingerprint',
  // Files & Docs
  'folder',
  'file',
  'file-text',
  'clipboard',
  'archive',
  'book',
  'notebook',
  // Status & Favorites
  'heart',
  'star',
  'bookmark',
  'flag',
  'target',
  'trophy',
  'award',
  'medal',
  // Dev & Tools
  'code',
  'terminal',
  'git-branch',
  'package',
  'puzzle',
  'wrench',
  'settings',
  'cog',
  // Transport
  'car',
  'truck',
  'plane',
  'train',
  'bike',
  'ship',
  // Buildings
  'building',
  'store',
  'warehouse',
  'factory',
  'landmark',
  'hotel',
  // Misc
  'rocket',
  'gamepad',
  'palette',
  'graduation-cap',
  'stethoscope',
  'scale',
  'umbrella',
];

interface EditDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: Dashboard;
  onDeleted: () => void;
}

export function EditDashboardDialog({
  open,
  onOpenChange,
  dashboard,
  onDeleted,
}: EditDashboardDialogProps) {
  const { t } = useLocale();
  const [name, setName] = useState(dashboard.name);
  const [icon, setIcon] = useState(dashboard.icon ?? '');
  const [iconSearch, setIconSearch] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutate: updateDashboard, isPending: saving } = useUpdateDashboard();
  const { mutate: deleteDashboard, isPending: deleting } = useDeleteDashboard();

  // Sync form state when dashboard changes
  useEffect(() => {
    setName(dashboard.name);
    setIcon(dashboard.icon ?? '');
    setIconSearch('');
  }, [dashboard.id, dashboard.name, dashboard.icon]);

  const filteredIcons = useMemo(
    () =>
      iconSearch ? ICON_OPTIONS.filter((n) => n.includes(iconSearch.toLowerCase())) : ICON_OPTIONS,
    [iconSearch]
  );

  const handleSave = () => {
    if (!name.trim()) return;
    updateDashboard(
      { id: dashboard.id, data: { name: name.trim(), icon: icon.trim() || undefined } },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleDelete = () => {
    deleteDashboard(dashboard.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        onOpenChange(false);
        onDeleted();
      },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bricks:dashboard.edit')}</DialogTitle>
            <DialogDescription>{t('bricks:dashboard.editDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-dashboard-name">{t('common:labels.name')}</Label>
              <Input
                id="edit-dashboard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Icon picker */}
            <div className="space-y-2">
              <Label>{t('bricks:dashboard.icon')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder={t('common:actions.search') + '...'}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <ScrollArea className="h-48 rounded-md border p-1.5">
                <div className="grid grid-cols-8 gap-1">
                  {/* Default / no icon option */}
                  <button
                    type="button"
                    title={t('common:labels.default')}
                    onClick={() => setIcon('')}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent',
                      !icon && 'bg-primary/10 ring-2 ring-primary'
                    )}
                  >
                    <LayoutDashboard className="size-4 text-muted-foreground" />
                  </button>
                  {filteredIcons.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      onClick={() => setIcon(iconName)}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent',
                        icon === iconName && 'bg-primary/10 ring-2 ring-primary'
                      )}
                    >
                      <DynamicIcon
                        name={iconName as IconName}
                        className="size-4"
                        fallback={() => null}
                      />
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {t('bricks:dashboard.delete')}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? t('common:messages.saving') : t('common:actions.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bricks:dashboard.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bricks:dashboard.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('common:messages.loading') : t('bricks:dashboard.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
