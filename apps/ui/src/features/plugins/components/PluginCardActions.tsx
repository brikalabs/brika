import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay';
import { Power, RotateCcw, Skull } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';

interface PluginCardActionsProps {
  uid: string;
  isBusy: boolean;
  onReload: (uid: string) => void;
  onDisable: (uid: string) => void;
  onKill: (uid: string) => void;
}

export function PluginCardActions({
  uid,
  isBusy,
  onReload,
  onDisable,
  onKill,
}: Readonly<PluginCardActionsProps>) {
  const { t } = useLocale();

  return (
    <div className="flex gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={(e) => {
              e.preventDefault();
              onReload(uid);
            }}
            disabled={isBusy}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('plugins:actions.reload')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={(e) => {
              e.preventDefault();
              onDisable(uid);
            }}
            disabled={isBusy}
          >
            <Power className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('plugins:actions.disable')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              onKill(uid);
            }}
            disabled={isBusy}
          >
            <Skull className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('plugins:actions.kill')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
