import { Button } from '@brika/clay/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@brika/clay/components/dialog';
import { ProgressDisplay } from '@brika/clay/components/progress-display';
import { Separator } from '@brika/clay/components/separator';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { Markdown } from '@/features/plugins/components/Markdown';
import { useWaitForHub } from '@/hooks/use-wait-for-hub';
import type { LocaleUtils } from '@/lib/use-locale';
import { useLocale } from '@/lib/use-locale';
import {
  type CompatReport,
  type HubUpdateInfo,
  type UpdateProgress,
  updateApi,
  updateKeys,
} from './api';

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

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: HubUpdateInfo;
  force?: boolean;
}

// ─── Extracted sub-components ────────────────────────────────────────────────

interface IdleContentProps {
  updateInfo: HubUpdateInfo;
  t: LocaleUtils['t'];
}

function compatHeadline(report: CompatReport, t: LocaleUtils['t']): string {
  if (report.willDisableCount > 0) {
    return t('common:updates.compatHeadlineDisabled', { count: report.willDisableCount });
  }
  return t('common:updates.compatHeadlineMissing', { count: report.missingRequirementsCount });
}

function CompatWarning({ report, t }: Readonly<{ report: CompatReport; t: LocaleUtils['t'] }>) {
  if (report.willDisableCount === 0 && report.missingRequirementsCount === 0) {
    return null;
  }
  const incompatible = report.plugins.filter((p) => !p.willBeCompatible);
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 text-amber-500" />
        <span>{compatHeadline(report, t)}</span>
      </div>
      {incompatible.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground text-xs">
          {incompatible.slice(0, 5).map((p) => (
            <li key={p.name}>
              <span className="font-mono">{p.name}</span>
              {p.currentRequires !== null && (
                <span className="text-muted-foreground/70">
                  {t('common:updates.compatPluginRequires', { range: p.currentRequires })}
                </span>
              )}
            </li>
          ))}
          {incompatible.length > 5 && (
            <li className="text-muted-foreground/70">
              {t('common:updates.compatAndMore', { count: incompatible.length - 5 })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function IdleContent({ updateInfo, t }: Readonly<IdleContentProps>) {
  const { data: compat } = useQuery({
    queryKey: updateKeys.compat,
    queryFn: updateApi.compat,
    enabled: updateInfo.updateAvailable,
  });
  return <IdleContentBody updateInfo={updateInfo} t={t} compat={compat} />;
}

function IdleContentBody({
  updateInfo,
  t,
  compat,
}: Readonly<IdleContentProps & { compat: CompatReport | undefined }>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-6 rounded-lg border bg-muted/30 py-4">
        <div className="text-center">
          <p className="text-muted-foreground text-xs">{t('common:updates.currentVersion')}</p>
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

      {compat !== undefined && <CompatWarning report={compat} t={t} />}

      {updateInfo.releaseNotes && <ReleaseNotes updateInfo={updateInfo} t={t} />}
    </div>
  );
}

interface ReleaseNotesProps {
  updateInfo: HubUpdateInfo;
  t: LocaleUtils['t'];
}

function ReleaseNotes({ updateInfo, t }: Readonly<ReleaseNotesProps>) {
  return (
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
  );
}

interface RestartingContentProps {
  t: LocaleUtils['t'];
}

function RestartingContent({ t }: Readonly<RestartingContentProps>) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <RefreshCw className="size-8 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-medium text-sm">{t('common:updates.restarting')}</p>
        <p className="text-muted-foreground text-xs">{t('common:updates.waitingForHub')}</p>
      </div>
    </div>
  );
}

interface UpdateFooterProps {
  state: DialogState;
  force: boolean | undefined;
  t: LocaleUtils['t'];
  onClose: () => void;
  onUpdate: () => void;
  onRetry: () => void;
}

function UpdateFooter({
  state,
  force,
  t,
  onClose,
  onUpdate,
  onRetry,
}: Readonly<UpdateFooterProps>) {
  if (state === 'idle') {
    return (
      <div className="flex w-full justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('common:actions.cancel')}
        </Button>
        <Button onClick={onUpdate}>
          <ArrowDownToLine />
          {force ? t('common:updates.reinstall') : t('common:updates.updateNow')}
        </Button>
      </div>
    );
  }

  if (state === 'updating') {
    return (
      <Button disabled>
        <Loader2 className="animate-spin" />
        {t('common:updates.updating')}
      </Button>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex w-full justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('common:actions.close')}
        </Button>
        <Button onClick={onRetry}>
          <ArrowDownToLine />
          {t('common:actions.retry')}
        </Button>
      </div>
    );
  }

  return null;
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Hard ceiling on the time we sit in `state: 'updating'` without
 * receiving a terminal `phase: 'restarting' | 'complete' | 'error'`
 * event. The download + verify + extract chain on a slow connection
 * comfortably fits in this window for a typical 50 MB artifact; if
 * the SSE stream goes silent past 5 min something has gone wrong on
 * the hub side and the user needs an escape hatch.
 */
const UPDATING_HARD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Render a user-facing message from any error thrown by `applyStream`.
 * The 409 refusal path on `/api/system/update/apply` carries a
 * `{code, guidance}` body via `ProgressStreamHttpError.body` — prefer
 * the `guidance` string when present (it's the strategy-authored,
 * human-readable explanation: "running in a container, pull a new
 * image", "dev mode, no binary to swap", etc.).
 */
function extractErrorMessage(err: unknown): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'body' in err &&
    err.body !== null &&
    typeof err.body === 'object' &&
    'guidance' in err.body &&
    typeof err.body.guidance === 'string' &&
    err.body.guidance.length > 0
  ) {
    return err.body.guidance;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function UpdateDialog({
  open,
  onOpenChange,
  updateInfo,
  force,
}: Readonly<UpdateDialogProps>) {
  const { t } = useLocale();
  const capture = useCapture();
  const [state, setState] = useState<DialogState>('idle');
  const [phase, setPhase] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const updatingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hubPoller = useWaitForHub(
    useCallback(() => {
      setError(`${t('common:updates.waitingForHub')} — timeout`);
      setState('error');
    }, [t]),
    {
      // Hub came back. Close the dialog so the user sees the freshly-
      // refetched UI (which now reports the new version). Without this
      // the dialog would sit on "En attente du redémarrage du hub…"
      // until the 60s timeout fired even though the hub was healthy.
      onReconnect: useCallback(() => {
        setState('idle');
        onOpenChange(false);
      }, [onOpenChange]),
    }
  );

  // Hard timeout on the `updating` state. Clears whenever we leave
  // it via terminal phase OR explicit user action.
  useEffect(() => {
    if (state !== 'updating') {
      if (updatingTimerRef.current !== undefined) {
        clearTimeout(updatingTimerRef.current);
        updatingTimerRef.current = undefined;
      }
      return;
    }
    updatingTimerRef.current = setTimeout(() => {
      setError(t('common:updates.timeoutMessage'));
      setState('error');
    }, UPDATING_HARD_TIMEOUT_MS);
    return () => {
      if (updatingTimerRef.current !== undefined) {
        clearTimeout(updatingTimerRef.current);
      }
    };
  }, [state, t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleUpdate = useCallback(async () => {
    setState('updating');
    setPhase('');
    setLogs([]);
    setError(null);

    try {
      const stream = await updateApi.applyStream({
        force,
      });

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
          capture('update.applied', { version: updateInfo.latestVersion, force: force ?? false });
          setState('restarting');
          hubPoller.start();
        }
      });

      await stream.onComplete();
    } catch (err) {
      setError(extractErrorMessage(err));
      setState('error');
    }
  }, [hubPoller, force, capture, updateInfo.latestVersion]);

  const handleClose = () => {
    if (state === 'updating' || state === 'restarting') {
      return;
    }
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
              ? t('common:updates.reinstallDescription', {
                  version: updateInfo.currentVersion,
                })
              : t('settings:update.description')}
          </DialogDescription>
        </DialogHeader>

        {state === 'idle' && <IdleContent updateInfo={updateInfo} t={t} />}

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

        {state === 'restarting' && <RestartingContent t={t} />}

        <DialogFooter>
          <UpdateFooter
            state={state}
            force={force}
            t={t}
            onClose={handleClose}
            onUpdate={handleUpdate}
            onRetry={handleUpdate}
          />
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
