import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Status,
  StatusIndicator,
  StatusLabel,
} from '@brika/clay';
import { ArrowUp, EllipsisVertical, Power, RotateCcw, Skull, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { UninstallDialog } from './UninstallDialog';

interface PluginHeaderActionsProps {
  pluginName: string;
  status: string;
  isBusy: boolean;
  updateAvailable: boolean;
  latestVersion?: string;
  onUpdate: () => void;
  onReload: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onKill: () => void;
  onUninstall: () => void;
}

export function PluginHeaderActions({
  pluginName,
  status,
  isBusy,
  updateAvailable,
  latestVersion,
  onUpdate,
  onReload,
  onDisable,
  onEnable,
  onKill,
  onUninstall,
}: Readonly<PluginHeaderActionsProps>) {
  const { t } = useLocale();
  const capture = useCapture();
  const [uninstallOpen, setUninstallOpen] = useState(false);

  const openUpdateDialog = (source: 'button' | 'menu') => {
    capture('plugins.update_dialog_opened', { source });
    onUpdate();
  };

  let statusVariant: 'success' | 'destructive' | 'neutral';
  if (status === 'running') {
    statusVariant = 'success';
  } else if (status === 'crashed') {
    statusVariant = 'destructive';
  } else {
    statusVariant = 'neutral';
  }

  return (
    <div className="flex items-center gap-2">
      <Status variant={statusVariant} className="px-3 py-1">
        <StatusIndicator pulse={status === 'running'} />
        <StatusLabel>{t(`common:status.${status}`)}</StatusLabel>
      </Status>

      <Button variant="outline" size="sm" onClick={onReload} disabled={isBusy} className="gap-1.5">
        <RotateCcw className="size-3.5" />
        {t('plugins:actions.reload')}
      </Button>

      {status === 'running' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onDisable}
          disabled={isBusy}
          className="gap-1.5"
        >
          <Power className="size-3.5" />
          {t('plugins:actions.disable')}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onEnable}
          disabled={isBusy}
          className="gap-1.5"
        >
          <Power className="size-3.5" />
          {t('plugins:actions.enable')}
        </Button>
      )}

      {updateAvailable && (
        <Button
          variant="default"
          size="sm"
          onClick={() => openUpdateDialog('button')}
          disabled={isBusy}
          className="gap-1.5"
        >
          <ArrowUp className="size-3.5" />
          {t('plugins:actions.update')}
          {latestVersion && (
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              v{latestVersion}
            </Badge>
          )}
        </Button>
      )}

      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            capture('plugins.actions_menu_opened', { status });
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm">
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!updateAvailable && (
            <DropdownMenuItem onClick={() => openUpdateDialog('menu')} disabled={isBusy}>
              <ArrowUp />
              {t('plugins:actions.update')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={onKill}
            disabled={isBusy || status !== 'running'}
          >
            <Skull />
            {t('plugins:actions.kill')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              capture('plugins.uninstall_dialog_opened');
              setUninstallOpen(true);
            }}
          >
            <Trash2 />
            {t('plugins:actions.uninstall')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UninstallDialog
        pluginName={pluginName}
        isBusy={isBusy}
        onUninstall={onUninstall}
        open={uninstallOpen}
        onOpenChange={setUninstallOpen}
      />
    </div>
  );
}
