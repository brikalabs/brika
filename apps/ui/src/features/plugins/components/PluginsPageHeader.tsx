import { Button, cn } from '@brika/clay';
import type { Plugin } from '@brika/plugin';
import { Plus, RefreshCw } from 'lucide-react';
import React from 'react';
import { useLocale } from '@/lib/use-locale';
import type { UpdateInfo } from '../registry-api';
import { InstallPluginDialog } from './InstallPluginDialog';
import { UpdateAllButton } from './UpdateAllButton';

interface PluginsPageHeaderProps {
  isLoading: boolean;
  pluginCount: number;
  plugins: Plugin[];
  availableUpdates: UpdateInfo[];
  onRefresh: () => void;
}

export function PluginsPageHeader({
  isLoading,
  pluginCount,
  plugins,
  availableUpdates,
  onRefresh,
}: Readonly<PluginsPageHeaderProps>) {
  const { t } = useLocale();
  const [installDialogOpen, setInstallDialogOpen] = React.useState(false);

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-baseline gap-2">
          <h1 className="font-semibold text-2xl tracking-tight">{t('plugins:title')}</h1>
          {pluginCount > 0 && (
            <span className="text-muted-foreground text-sm">({pluginCount})</span>
          )}
        </div>
        <p className="mt-0.5 text-muted-foreground text-sm">{t('plugins:subtitle')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          className="size-8"
        >
          <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
        </Button>
        <UpdateAllButton updates={availableUpdates} plugins={plugins} />
        <Button size="sm" className="gap-1.5" onClick={() => setInstallDialogOpen(true)}>
          <Plus className="size-4" />
          {t('plugins:actions.load')}
        </Button>
        <InstallPluginDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
      </div>
    </div>
  );
}
