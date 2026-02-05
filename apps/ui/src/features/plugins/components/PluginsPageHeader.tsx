import { Plus, RefreshCw } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { InstallPluginDialog } from './InstallPluginDialog';
import { UpdateAllButton } from './UpdateAllButton';

interface PluginsPageHeaderProps {
  isLoading: boolean;
  onRefresh: () => void;
}

export function PluginsPageHeader({ isLoading, onRefresh }: PluginsPageHeaderProps) {
  const { t } = useLocale();
  const [installDialogOpen, setInstallDialogOpen] = React.useState(false);

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('plugins:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('plugins:subtitle')}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onRefresh} disabled={isLoading} className="gap-2">
          <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
          {t('common:actions.refresh')}
        </Button>
        <UpdateAllButton />
        <Button className="gap-2" onClick={() => setInstallDialogOpen(true)}>
          <Plus className="size-4" />
          {t('plugins:actions.load')}
        </Button>
        <InstallPluginDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
      </div>
    </div>
  );
}
