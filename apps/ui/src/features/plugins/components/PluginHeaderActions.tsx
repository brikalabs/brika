import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@brika/clay';
import { ArrowUp, EllipsisVertical, Power, RotateCcw, Skull, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
  const [uninstallOpen, setUninstallOpen] = useState(false);

  let statusBadgeVariant: 'default' | 'destructive' | 'secondary';
  if (status === 'running') {
    statusBadgeVariant = 'default';
  } else if (status === 'crashed') {
    statusBadgeVariant = 'destructive';
  } else {
    statusBadgeVariant = 'secondary';
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={statusBadgeVariant} className="px-3 py-1">
        {t(`common:status.${status}`)}
      </Badge>

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
          onClick={onUpdate}
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm">
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!updateAvailable && (
            <DropdownMenuItem onClick={onUpdate} disabled={isBusy}>
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
          <DropdownMenuItem variant="destructive" onClick={() => setUninstallOpen(true)}>
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
