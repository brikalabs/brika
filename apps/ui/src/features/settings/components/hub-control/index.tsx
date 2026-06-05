import { Badge, Button, ButtonGroup } from '@brika/clay';
import { Loader2, Power, RefreshCw } from 'lucide-react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { useSystem } from '../../hooks';
import { useHubControl } from './hooks';

export function HubControlSection() {
  const { t } = useLocale();
  const capture = useCapture();
  const { data: system } = useSystem();
  const { state, setState, busy, handleRestart, handleStop } = useHubControl();

  return (
    <div className="space-y-4">
      {system?.pid && (
        <Badge variant="secondary" className="font-mono">
          PID {system.pid}
        </Badge>
      )}

      {state === 'restarting' && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          {t('settings:hubControl.restarting')}
        </div>
      )}

      {state === 'stopped' && (
        <p className="text-muted-foreground text-sm">{t('settings:hubControl.stopped')}</p>
      )}

      {state !== 'restarting' && state !== 'stopped' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              capture('settings.hub_restart_clicked');
              handleRestart();
            }}
            disabled={busy}
          >
            <RefreshCw />
            {t('settings:hubControl.restart')}
          </Button>

          {state === 'confirmStop' ? (
            <ButtonGroup>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  capture('settings.hub_stop_confirmed');
                  handleStop();
                }}
                disabled={busy}
              >
                <Power />
                {t('settings:hubControl.confirmStop')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  capture('settings.hub_stop_cancelled');
                  setState('idle');
                }}
              >
                {t('common:actions.cancel')}
              </Button>
            </ButtonGroup>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                capture('settings.hub_stop_requested');
                setState('confirmStop');
              }}
              disabled={busy}
            >
              <Power />
              {t('settings:hubControl.stop')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
