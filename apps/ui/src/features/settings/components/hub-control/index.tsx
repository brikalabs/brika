import {
  Badge,
  Button,
  ButtonGroup,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
} from '@brika/clay';
import { Loader2, Power, RefreshCw, Terminal } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { useSystem } from '../../hooks';
import { useHubControl } from './hooks';

export function HubControlSection() {
  const { t } = useLocale();
  const { data: system } = useSystem();
  const { state, setState, busy, handleRestart, handleStop } = useHubControl();

  return (
    <>
      <SectionHeader>
        <SectionInfo>
          <SectionIcon>
            <Terminal className="size-4" />
          </SectionIcon>
          <div>
            <SectionTitle>{t('settings:hubControl.title')}</SectionTitle>
            <SectionDescription>{t('settings:hubControl.description')}</SectionDescription>
          </div>
        </SectionInfo>
        {system?.pid && (
          <Badge variant="secondary" className="font-mono">
            PID {system.pid}
          </Badge>
        )}
      </SectionHeader>

      <SectionContent className="space-y-3">
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
      </SectionContent>
    </>
  );
}
