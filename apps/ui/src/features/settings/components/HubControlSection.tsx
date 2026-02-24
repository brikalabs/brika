/**
 * Hub Control Section
 *
 * Settings section for restarting or stopping the Brika hub.
 */

import { Loader2, Power, RefreshCw, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useLocale } from '@/lib/use-locale';
import { useRestartHub, useStopHub, useSystem } from '../hooks';

const HEALTH_POLL_INTERVAL = 500;
const HEALTH_TIMEOUT = 60_000;

type ControlState = 'idle' | 'restarting' | 'confirmStop' | 'stopped';

export function HubControlSection() {
  const { t } = useLocale();
  const [state, setState] = useState<ControlState>('idle');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const healthTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: system } = useSystem();
  const restartMutation = useRestartHub();
  const stopMutation = useStopHub();

  useEffect(() => {
    return () => {
      clearInterval(pollIntervalRef.current);
      clearTimeout(healthTimeoutRef.current);
    };
  }, []);

  const waitForHub = useCallback(() => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = (await res.json()) as { ready?: boolean };
          if (data.ready) {
            clearInterval(pollIntervalRef.current);
            clearTimeout(healthTimeoutRef.current);
            globalThis.location.reload();
          }
        }
      } catch {
        // hub not yet up, keep polling
      }
    }, HEALTH_POLL_INTERVAL);

    healthTimeoutRef.current = setTimeout(() => {
      clearInterval(pollIntervalRef.current);
      setState('idle');
    }, HEALTH_TIMEOUT);
  }, []);

  const handleRestart = useCallback(() => {
    setState('restarting');
    restartMutation.mutate(undefined, {
      onSuccess: () => waitForHub(),
      onError: () => setState('idle'),
    });
  }, [restartMutation, waitForHub]);

  const handleStop = useCallback(() => {
    stopMutation.mutate(undefined, {
      onSuccess: () => setState('stopped'),
      onError: () => setState('idle'),
    });
  }, [stopMutation]);

  const busy = restartMutation.isPending || stopMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            <AvatarFallback>
              <Terminal className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold text-base">{t('settings:hubControl.title')}</h3>
            <p className="text-muted-foreground text-sm">{t('settings:hubControl.description')}</p>
          </div>
        </div>
        {system?.pid && (
          <Badge variant="secondary" className="font-mono">
            PID {system.pid}
          </Badge>
        )}
      </div>

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRestart} disabled={busy}>
            <RefreshCw />
            {t('settings:hubControl.restart')}
          </Button>

          {state === 'confirmStop' ? (
            <ButtonGroup>
              <Button variant="destructive" size="sm" onClick={handleStop} disabled={busy}>
                <Power />
                {t('settings:hubControl.confirmStop')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setState('idle')}>
                {t('common:actions.cancel')}
              </Button>
            </ButtonGroup>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setState('confirmStop')}
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
