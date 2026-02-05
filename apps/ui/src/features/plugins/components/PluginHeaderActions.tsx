/**
 * PluginHeaderActions Component
 *
 * Action buttons for plugin detail header.
 */

import { ArrowUp, Power, RefreshCw, RotateCcw, Skull } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { ActionButton } from './ActionButton';
import { UninstallDialog } from './UninstallDialog';

interface PluginHeaderActionsProps {
  pluginName: string;
  status: string;
  isBusy: boolean;
  onRefresh: () => void;
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
  onRefresh,
  onUpdate,
  onReload,
  onDisable,
  onEnable,
  onKill,
  onUninstall,
}: Readonly<PluginHeaderActionsProps>) {
  const { t } = useLocale();

  const statusBadgeVariant =
    status === 'running' ? 'default' : status === 'crashed' ? 'destructive' : 'secondary';

  return (
    <div className="flex items-center gap-2">
      <Badge variant={statusBadgeVariant} className="px-3 py-1">
        {t(`common:status.${status}`)}
      </Badge>

      <ActionButton icon={RefreshCw} tooltip={t('common:actions.refresh')} onClick={onRefresh} />
      <ActionButton
        icon={ArrowUp}
        tooltip={t('plugins:actions.update')}
        onClick={onUpdate}
        disabled={isBusy}
      />
      <ActionButton
        icon={RotateCcw}
        tooltip={t('plugins:actions.reload')}
        onClick={onReload}
        disabled={isBusy}
      />

      {status === 'running' ? (
        <Button variant="outline" onClick={onDisable} disabled={isBusy} className="gap-2">
          <Power className="size-4" />
          {t('plugins:actions.disable')}
        </Button>
      ) : (
        <Button variant="outline" onClick={onEnable} disabled={isBusy} className="gap-2">
          <Power className="size-4" />
          {t('plugins:actions.enable')}
        </Button>
      )}

      <ActionButton
        icon={Skull}
        tooltip={t('plugins:actions.kill')}
        onClick={onKill}
        disabled={isBusy || status !== 'running'}
        variant="destructive"
      />

      <UninstallDialog pluginName={pluginName} isBusy={isBusy} onUninstall={onUninstall} />
    </div>
  );
}
