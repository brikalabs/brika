import { Button } from '@brika/clay/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay/components/tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, Loader2, Trash2 } from 'lucide-react';
import React from 'react';
import { pluginsKeys } from '@/features/plugins/api';
import { registryApi, registryKeys } from '@/features/plugins/registry-api';
import { useLocale } from '@/lib/use-locale';
import type { StorePlugin } from '../types';
import { InstallProgressDialog } from './InstallProgressDialog';

interface InstallButtonProps {
  plugin: Pick<StorePlugin, 'name' | 'installVersion' | 'installed' | 'compatible' | 'source'>;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
}

export function InstallButton({
  plugin,
  size = 'sm',
  variant = 'outline',
}: Readonly<InstallButtonProps>) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [isWorking, setIsWorking] = React.useState(false);
  const [showInstallDialog, setShowInstallDialog] = React.useState(false);

  const handleInstall = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowInstallDialog(true);
  };

  const handleUninstall = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsWorking(true);

    try {
      await registryApi.uninstall(plugin.name);

      // Await invalidation so the spinner stays until fresh data arrives
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: pluginsKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: registryKeys.packages,
        }),
        queryClient.invalidateQueries({
          queryKey: ['store'],
        }),
      ]);
    } catch (error) {
      console.error('Uninstall failed:', error);
    } finally {
      setIsWorking(false);
    }
  };

  if (plugin.installed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant={variant}
            onClick={handleUninstall}
            disabled={isWorking}
            className="gap-2"
          >
            {isWorking && <Loader2 className="size-4 animate-spin" />}
            {!isWorking && size === 'icon' && <Trash2 className="size-4" />}
            {!isWorking && size !== 'icon' && (
              <>
                <Check className="size-4" />
                {t('store:actions.installed')}
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('store:actions.clickToUninstall')}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            variant={variant}
            onClick={handleInstall}
            disabled={!plugin.compatible}
            className="gap-2"
          >
            {size === 'icon' ? (
              <Download className="size-4" />
            ) : (
              <>
                <Download className="size-4" />
                {t('store:actions.install')}
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {plugin.compatible
              ? t('store:actions.clickToInstall')
              : t('store:badges.incompatibleTooltip')}
          </p>
        </TooltipContent>
      </Tooltip>

      <InstallProgressDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        packageName={plugin.name}
        version={plugin.installVersion}
      />
    </>
  );
}
