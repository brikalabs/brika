import { Button } from '@brika/clay/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay/components/tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, Check, Download, Loader2, Trash2 } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { pluginsKeys } from '@/features/plugins/api';
import { UpdatePluginDialog } from '@/features/plugins/components/UpdatePluginDialog';
import { registryApi, registryKeys } from '@/features/plugins/registry-api';
import { useLocale } from '@/lib/use-locale';
import type { StorePlugin } from '../types';
import { InstallProgressDialog } from './InstallProgressDialog';

interface InstallButtonProps {
  plugin: Pick<
    StorePlugin,
    | 'name'
    | 'version'
    | 'installVersion'
    | 'installed'
    | 'installedVersion'
    | 'updateAvailable'
    | 'compatible'
    | 'source'
  >;
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
  const capture = useCapture();
  const [isWorking, setIsWorking] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  const handleInstall = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    capture('store.install_clicked', { source: plugin.source, size });
    setShowInstallDialog(true);
  };

  const handleUpdate = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    capture('store.update_clicked', { source: plugin.source, size });
    setShowUpdateDialog(true);
  };

  const handleUninstall = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    capture('store.uninstall_clicked', { source: plugin.source });
    setIsWorking(true);

    try {
      await registryApi.uninstall(plugin.name);
      capture('store.uninstalled', { source: plugin.source });

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
      capture('store.uninstall_failed', { source: plugin.source });
      console.error('Uninstall failed:', error);
    } finally {
      setIsWorking(false);
    }
  };

  // Render the install dialog unconditionally (not inside the not-installed branch): a successful
  // install flips `plugin.installed` to true, and unmounting the dialog then would snap it shut
  // before the operator can read the install + build logs. It stays open until they close it.
  const trigger = plugin.installed ? (
    <div className="flex items-center gap-1.5">
      {plugin.updateAvailable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size={size} variant={variant} onClick={handleUpdate} className="gap-2">
              <ArrowUpCircle className="size-4" />
              {size !== 'icon' && t('store:actions.update')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('store:actions.clickToUpdate', { version: plugin.version })}</p>
          </TooltipContent>
        </Tooltip>
      )}
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
    </div>
  ) : (
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
  );

  return (
    <>
      {trigger}
      <InstallProgressDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        packageName={plugin.name}
        version={plugin.installVersion}
      />
      {/* Mounted while open even after the update finishes and `updateAvailable` flips false, so the
          dialog stays open with its logs + build trace until the operator closes it. */}
      {(plugin.updateAvailable || showUpdateDialog) && (
        <UpdatePluginDialog
          open={showUpdateDialog}
          onOpenChange={setShowUpdateDialog}
          packageName={plugin.name}
          currentVersion={plugin.installedVersion}
          latestVersion={plugin.version}
          mode="update"
        />
      )}
    </>
  );
}
