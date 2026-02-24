import { ArrowDownToLine, ArrowRight, ExternalLink, Loader2, RefreshCw, Tag } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProgressDisplay } from '@/components/ui/progress-display';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/features/plugins/components/Markdown';
import { useLocale } from '@/lib/use-locale';
import { type HubUpdateInfo, type UpdateProgress, updateApi } from './api';

type DialogState = 'idle' | 'updating' | 'restarting' | 'error';

const PHASE_PROGRESS: Record<string, number> = {
  checking: 5,
  downloading: 35,
  verifying: 55,
  extracting: 70,
  installing: 90,
  restarting: 100,
  complete: 100,
};

const HEALTH_TIMEOUT = 60_000;

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: HubUpdateInfo;
  force?: boolean;
}

export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  force,
}: Readonly<UpdateDialogProps>) {
  const { t } = useLocale();
  const [state, setState] = useState<DialogState>('idle');
  const [phase, setPhase] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const healthTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    return () => {
      clearTimeout(healthTimeoutRef.current);
      clearInterval(pollIntervalRef.current);
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
    }, 500);

    healthTimeoutRef.current = setTimeout(() => {
      clearInterval(pollIntervalRef.current);
      setError(t('common:updates.waitingForHub') + ' — timeout');
      setState('error');
    }, HEALTH_TIMEOUT);
  }, [t]);

  const handleUpdate = useCallback(async () => {
    setState('updating');
    setPhase('');
    setLogs([]);
    setError(null);

    try {
      const stream = await updateApi.applyStream({ force });

      stream.onProgress((p: UpdateProgress) => {
        setPhase(p.phase);
        if (p.message) {
          setLogs((prev) => {
            // Replace the last entry while still in the same phase (e.g. download %)
            if (prev.length > 0 && p.phase === 'downloading') {
              return [...prev.slice(0, -1), p.message];
            }
            return [...prev, p.message];
          });
        }

        if (p.phase === 'error') {
          setError(p.error ?? p.message);
          setState('error');
        } else if (p.phase === 'restarting' || p.phase === 'complete') {
          setState('restarting');
          waitForHub();
        }
      });

      await stream.onComplete();
    } catch (err) {
      setError(String(err));
      setState('error');
    }
  }, [waitForHub, force]);

  const handleClose = () => {
    if (state === 'updating' || state === 'restarting') return;
    setState('idle');
    setPhase('');
    setLogs([]);
    setError(null);
    onOpenChange(false);
  };

  const progressValue = PHASE_PROGRESS[phase] ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={state !== 'updating' && state !== 'restarting'}
      >
        <DialogHeader>
          <DialogTitle>
            {force ? t('common:updates.reinstall') : t('common:updates.available')}
          </DialogTitle>
          <DialogDescription>
            {force
              ? t('common:updates.reinstallDescription', { version: updateInfo.currentVersion })
              : t('settings:update.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Idle state */}
        {state === 'idle' && (
          <div className="space-y-4">
            {/* Version display */}
            <div className="flex items-center justify-center gap-6 rounded-lg border bg-muted/30 py-4">
              <div className="text-center">
                <p className="text-muted-foreground text-xs">
                  {t('common:updates.currentVersion')}
                </p>
                <div className="flex items-center gap-1.5">
                  <Tag className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold">v{updateInfo.currentVersion}</span>
                </div>
                {updateInfo.currentCommit && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {updateInfo.currentCommit.slice(0, 7)}
                  </p>
                )}
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
              <div className="text-center">
                <p className="text-muted-foreground text-xs">{t('common:updates.latestVersion')}</p>
                <div className="flex items-center gap-1.5">
                  <Tag
                    className={`size-3.5 ${updateInfo.updateAvailable ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span
                    className={`font-mono font-semibold ${updateInfo.updateAvailable ? 'text-primary' : ''}`}
                  >
                    v{updateInfo.latestVersion}
                  </span>
                </div>
                {updateInfo.releaseCommit && (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {updateInfo.releaseCommit.slice(0, 7)}
                  </p>
                )}
              </div>
            </div>

            {/* Release notes */}
            {updateInfo.releaseNotes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{t('common:updates.releaseNotes')}</p>
                    {updateInfo.releaseUrl && (
                      <a
                        href={updateInfo.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                      >
                        {t('common:updates.viewRelease')}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 px-4 py-3 text-sm">
                    <Markdown>{updateInfo.releaseNotes}</Markdown>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Updating state */}
        {(state === 'updating' || state === 'error') && (
          <ProgressDisplay
            progressValue={progressValue}
            phaseLabel={getPhaseLabel(phase, t)}
            logs={logs}
            scrollRef={scrollRef}
            error={error}
            success={false}
            isProcessing={state === 'updating'}
          />
        )}

        {/* Restarting state */}
        {state === 'restarting' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <RefreshCw className="size-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-sm">{t('common:updates.restarting')}</p>
              <p className="text-muted-foreground text-xs">{t('common:updates.waitingForHub')}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {state === 'idle' && (
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleUpdate}>
                <ArrowDownToLine />
                {force ? t('common:updates.reinstall') : t('common:updates.updateNow')}
              </Button>
            </div>
          )}
          {state === 'updating' && (
            <Button disabled>
              <Loader2 className="animate-spin" />
              {t('common:updates.updating')}
            </Button>
          )}
          {state === 'error' && (
            <Button variant="outline" onClick={handleClose}>
              {t('common:actions.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PHASE_KEYS: Record<string, string> = {
  checking: 'common:updates.checking',
  downloading: 'common:updates.downloading',
  verifying: 'common:updates.verifying',
  extracting: 'common:updates.extracting',
  installing: 'common:updates.installing',
  restarting: 'common:updates.restarting',
  complete: 'common:updates.complete',
  error: 'common:updates.failed',
};

function getPhaseLabel(phase: string, t: ReturnType<typeof useLocale>['t']): string {
  const key = PHASE_KEYS[phase];
  return key ? t(key) : '';
}
