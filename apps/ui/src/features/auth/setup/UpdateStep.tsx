/**
 * Onboarding "Update" step.
 *
 * Sits between `location` and `complete`. Asks the hub once whether a
 * newer release is available, then surfaces one of these visible states:
 *
 *   - `up-to-date` / `dev-build` / `channel-mismatch` → success card
 *     with a manual Continue button. The user always confirms before
 *     moving on — no automatic redirect.
 *   - `available` → version diff + Update / Skip + a link to the
 *     release notes on GitHub.
 *   - `updating` → uses the same `ProgressDisplay` clay component the
 *     `UpdateDialog` uses, driven by SSE phase events.
 *   - `restarting` → elapsed-time pulse while `useWaitForHub` polls
 *     `/api/health` for `ready: true`, then reloads the page.
 *
 * The check has a minimum dwell of `CHECK_MIN_DURATION` so the "checking"
 * UI is always perceptible even when the API resolves in ~30ms.
 */

import { Button, cn, Spinner } from '@brika/clay';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@brika/clay/components/dialog';
import { ProgressDisplay } from '@brika/clay/components/progress-display';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  FileText,
  FlaskConical,
  Tag,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { Markdown } from '@/features/plugins/components/Markdown';
import { useUpdateCheck } from '@/features/updates';
import { type HubUpdateInfo, type UpdateProgress, updateApi } from '@/features/updates/api';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { useWaitForHub } from '@/hooks/use-wait-for-hub';
import { Eyebrow, StepBody, StepHeader, StepNav } from './shared';

type StepState =
  | 'loading'
  | 'up-to-date'
  | 'dev-build'
  | 'channel-mismatch'
  | 'available'
  | 'updating'
  | 'restarting'
  | 'error';

/** Minimum time the "checking" state stays visible so it doesn't flash. */
const CHECK_MIN_DURATION_MS = 800;
/** Soft warning copy after we've been waiting this long for the hub to come back. */
const RESTART_SLOW_THRESHOLD_MS = 30_000;

const PHASE_PROGRESS: Record<string, number> = {
  checking: 5,
  downloading: 35,
  verifying: 55,
  extracting: 70,
  installing: 90,
  restarting: 100,
  complete: 100,
};

function pickInitialState(data: HubUpdateInfo | undefined): StepState {
  if (!data) {
    return 'loading';
  }
  // Order matters: channelMismatch must beat devBuild, since the hub now
  // splits the two and we want the more specific copy when it applies.
  if (data.channelMismatch) {
    return 'channel-mismatch';
  }
  if (data.devBuild) {
    return 'dev-build';
  }
  if (!data.updateAvailable) {
    return 'up-to-date';
  }
  return 'available';
}

export function UpdateStep() {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();
  const capture = useCapture();
  const { data, isLoading } = useUpdateCheck();
  const [state, setState] = useState<StepState>('loading');
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logsScrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the spinner up for a perceptible minimum even when the API
  // resolves in ~30ms — useDelayedLoading's `minDuration` is what we want.
  const showCheckingDwell = useDelayedLoading(isLoading, {
    delay: 0,
    minDuration: CHECK_MIN_DURATION_MS,
  });

  const hubPoller = useWaitForHub(
    useCallback(() => {
      setError(t('update.restartTimeout'));
      setState('error');
    }, [t]),
    {
      // Hub came back. Drop back to `loading` so the natural state
      // machine re-derives where to land (up-to-date now, on the
      // freshly-installed version). Without this the spinner would
      // hang on "restarting" until the 60s timeout.
      onReconnect: useCallback(() => setState('loading'), []),
    }
  );

  // Drive the transition out of `loading`. We wait for both the query to
  // resolve *and* the minimum dwell to elapse so the user sees we checked.
  useEffect(() => {
    if (state !== 'loading') {
      return;
    }
    if (isLoading || showCheckingDwell) {
      return;
    }
    setState(pickInitialState(data));
  }, [data, isLoading, showCheckingDwell, state]);

  // Auto-scroll the SSE log pane as new lines arrive.
  useEffect(() => {
    if (logsScrollRef.current) {
      logsScrollRef.current.scrollTop = logsScrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSkip = useCallback(() => {
    navigate({ to: '/setup/complete' });
  }, [navigate]);

  const handleUpdate = useCallback(async () => {
    capture('auth.setup_update_started');
    setState('updating');
    setPhase('checking');
    setLogs([]);
    setError(null);
    try {
      const stream = await updateApi.applyStream();
      stream.onProgress((p: UpdateProgress) => {
        setPhase(p.phase);
        if (p.message) {
          setLogs((prev) => {
            // Collapse repeated `downloading` lines so the percentage
            // counter doesn't fill the log box.
            if (prev.length > 0 && p.phase === 'downloading') {
              return [...prev.slice(0, -1), p.message];
            }
            return [...prev, p.message];
          });
        }
        if (p.phase === 'error') {
          setError(p.error ?? p.message ?? t('update.failed'));
          setState('error');
        } else if (p.phase === 'restarting' || p.phase === 'complete') {
          setState('restarting');
          hubPoller.start();
        }
      });
      await stream.onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [hubPoller, t, capture]);

  if (state === 'loading') {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.title')}
          subtitle={t('update.checking')}
        />
        <StepBody>
          <CheckingCard label={t('update.checking')} eyebrow={t('update.checkingBadge')} />
          <StepNav back="/setup/location" next="/setup/complete" continueLabel={t('update.skip')} />
        </StepBody>
      </>
    );
  }

  if (state === 'up-to-date' && data) {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.upToDateTitle')}
          subtitle={t('update.upToDateSubtitle', { version: data.currentVersion })}
        />
        <StepBody>
          <SuccessCard
            icon="check"
            version={data.currentVersion}
            label={t('update.upToDateBadge')}
          />
          <StepNav
            back="/setup/location"
            onContinue={handleSkip}
            continueLabel={t('update.continue')}
          />
        </StepBody>
      </>
    );
  }

  if (state === 'dev-build' && data) {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.devBuildTitle')}
          subtitle={t('update.devBuildSubtitle', { version: data.currentVersion })}
        />
        <StepBody>
          <SuccessCard
            icon="flask"
            version={data.currentVersion}
            label={t('update.devBuildBadge')}
          />
          <StepNav
            back="/setup/location"
            onContinue={handleSkip}
            continueLabel={t('update.continue')}
          />
        </StepBody>
      </>
    );
  }

  if (state === 'channel-mismatch' && data) {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.channelMismatchTitle')}
          subtitle={t('update.channelMismatchSubtitle', {
            current: data.currentVersion,
            channel: data.channel,
          })}
        />
        <StepBody>
          <SuccessCard
            icon="flask"
            version={data.currentVersion}
            label={t('update.channelMismatchBadge')}
          />
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            {t('update.channelMismatchHelp')}
          </p>
          <StepNav
            back="/setup/location"
            onContinue={handleSkip}
            continueLabel={t('update.continue')}
          />
        </StepBody>
      </>
    );
  }

  if ((state === 'available' || state === 'error') && data) {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.availableTitle')}
          subtitle={t('update.availableSubtitle')}
        />
        <StepBody>
          <VersionDiff
            current={data.currentVersion}
            latest={data.latestVersion}
            assetSizeLabel={formatAssetSize(data.assetSize)}
          />
          {data.releaseNotes && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  capture('auth.setup_release_notes_opened');
                  setReleaseNotesOpen(true);
                }}
              >
                <FileText className="size-3.5" />
                {t('update.viewReleaseNotes')}
              </Button>
            </div>
          )}
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <Button size="lg" className="flex-1 gap-2" onClick={handleUpdate}>
              <ArrowDownToLine className="size-4" />
              {t('update.updateNow')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                capture('auth.setup_update_skipped');
                handleSkip();
              }}
            >
              {t('update.skip')}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </StepBody>
        <ReleaseNotesDialog
          open={releaseNotesOpen}
          onOpenChange={setReleaseNotesOpen}
          version={data.latestVersion}
          notes={data.releaseNotes}
          title={t('update.releaseNotesTitle', { version: data.latestVersion })}
          description={t('update.releaseNotesDescription')}
        />
      </>
    );
  }

  if (state === 'updating') {
    const progressValue = PHASE_PROGRESS[phase] ?? 0;
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.applying')}
          subtitle={t('update.applyingSubtitle')}
        />
        <StepBody>
          <ProgressDisplay
            progressValue={progressValue}
            phaseLabel={getPhaseLabel(phase, t)}
            logs={logs}
            scrollRef={logsScrollRef}
            error={null}
            success={false}
            isProcessing
            emptyLogsMessage={t('update.preparing')}
          />
        </StepBody>
      </>
    );
  }

  if (state === 'restarting') {
    return <RestartingState t={t} />;
  }

  return null;
}

interface CheckingCardProps {
  /** Accessible label voiced to assistive tech while the spinner runs. */
  label: string;
  /** Short eyebrow line below the halo (e.g. "Checking GitHub…"). */
  eyebrow: string;
}

/**
 * "We're checking" placeholder. Matches the geometry of {@link SuccessCard}
 * so the transition from checking → up-to-date / dev-build / channel-mismatch
 * looks like the halo crystallising into the real result, not a layout swap.
 */
function CheckingCard({ label, eyebrow }: Readonly<CheckingCardProps>) {
  return (
    <div className="fade-in-50 relative flex animate-in flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-muted/10 py-10 duration-300">
      <IconHalo tone="primary">
        <Spinner size="lg" label={label} className="text-primary" />
      </IconHalo>
      <Eyebrow>{eyebrow}</Eyebrow>
    </div>
  );
}

type Tone = 'primary' | 'emerald' | 'violet';

const HALO_OUTER: Record<Tone, string> = {
  primary: 'bg-primary/10',
  emerald: 'bg-emerald-500/10',
  violet: 'bg-violet-500/10',
};

const HALO_INNER: Record<Tone, string> = {
  primary: 'bg-primary/20 ring-primary/30',
  emerald: 'bg-emerald-500/20 ring-emerald-500/30',
  violet: 'bg-violet-500/20 ring-violet-500/30',
};

interface IconHaloProps {
  tone: Tone;
  children: ReactNode;
}

/**
 * Concentric soft-glow halo behind a centered icon. Single primitive used
 * by every "centered result" card on this step so the geometry stays
 * identical across checking / success / dev-build / channel-mismatch /
 * restarting — the swap reads as a tone change rather than a layout shift.
 */
function IconHalo({ tone, children }: Readonly<IconHaloProps>) {
  return (
    <div className={cn('flex size-20 items-center justify-center rounded-full', HALO_OUTER[tone])}>
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-full ring-1',
          HALO_INNER[tone]
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface SuccessCardProps {
  icon: 'check' | 'flask';
  version: string;
  label: string;
}

function SuccessCard({ icon, version, label }: Readonly<SuccessCardProps>) {
  const Icon = icon === 'check' ? CheckCircle2 : FlaskConical;
  const tone: Tone = icon === 'check' ? 'emerald' : 'violet';
  const accent = icon === 'check' ? 'text-emerald-500' : 'text-violet-500';
  const surface =
    icon === 'check'
      ? 'from-emerald-500/10 to-emerald-500/0 border-emerald-500/30'
      : 'from-violet-500/10 to-violet-500/0 border-violet-500/30';
  return (
    <div
      className={cn(
        'fade-in-50 zoom-in-95 relative flex animate-in flex-col items-center gap-4 overflow-hidden rounded-2xl border bg-linear-to-b py-10 duration-500',
        surface
      )}
    >
      <IconHalo tone={tone}>
        <Icon className={cn('size-6', accent)} />
      </IconHalo>
      <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 shadow-xs">
        <Tag className="size-3.5 text-muted-foreground" />
        <span className="font-mono font-semibold text-sm">v{version}</span>
      </div>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}

interface RestartingStateProps {
  t: ReturnType<typeof useTranslation<'setup'>>['t'];
}

function RestartingState({ t }: Readonly<RestartingStateProps>) {
  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const slow = elapsed * 1000 >= RESTART_SLOW_THRESHOLD_MS;

  return (
    <>
      <StepHeader
        eyebrow={t('update.eyebrow')}
        title={t('update.restarting')}
        subtitle={t('update.restartingSubtitle')}
      />
      <StepBody>
        <div className="fade-in-50 relative flex animate-in flex-col items-center gap-4 overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-b from-primary/5 to-primary/0 py-10 duration-300">
          <IconHalo tone="primary">
            <Spinner size="lg" label={t('update.restarting')} className="text-primary" />
          </IconHalo>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 shadow-xs">
            <span className="font-mono font-semibold text-sm tabular-nums">
              {t('update.restartingElapsed', { seconds: elapsed })}
            </span>
          </div>
          <Eyebrow>{t('update.restartingReloadHint')}</Eyebrow>
          {slow && (
            <p className="mx-6 max-w-sm rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-center text-[12.5px] text-amber-600 leading-relaxed">
              {t('update.restartingSlow')}
            </p>
          )}
        </div>
      </StepBody>
    </>
  );
}

interface VersionDiffProps {
  current: string;
  latest: string;
  /** Optional download size hint, formatted by the caller (e.g. "12.4 MB"). */
  assetSizeLabel?: string;
}

function VersionDiff({ current, latest, assetSizeLabel }: Readonly<VersionDiffProps>) {
  return (
    <div className="fade-in-50 relative animate-in overflow-hidden rounded-2xl border border-primary/20 bg-linear-to-b from-primary/5 to-primary/0 py-6 duration-300">
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
            current
          </p>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1">
            <Tag className="size-3.5 text-muted-foreground" />
            <span className="font-medium font-mono text-muted-foreground text-sm">v{current}</span>
          </div>
        </div>
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
          <ArrowRight className="size-4 text-primary" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-mono text-[10px] text-primary uppercase tracking-[0.18em]">latest</p>
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 shadow-xs">
            <Tag className="size-3.5 text-primary" />
            <span className="font-mono font-semibold text-primary text-sm">v{latest}</span>
          </div>
        </div>
      </div>
      {assetSizeLabel && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          <span className="font-mono">{assetSizeLabel}</span>
        </p>
      )}
    </div>
  );
}

interface ReleaseNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  notes: string;
  title: string;
  description: string;
}

/**
 * Modal that renders the release notes markdown body. Same affordance
 * as `Settings → System → Updates`, just surfaced inline in the
 * onboarding step so the user doesn't need to leave the flow.
 */
function ReleaseNotesDialog({
  open,
  onOpenChange,
  notes,
  title,
  description,
}: Readonly<ReleaseNotesDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <Markdown>{notes}</Markdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Format bytes as MB with one decimal. Returns null for non-positive sizes. */
function formatAssetSize(bytes: number | null | undefined): string | undefined {
  if (!bytes || bytes <= 0) {
    return undefined;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

const PHASE_KEYS: Record<string, string> = {
  checking: 'update.phase.checking',
  downloading: 'update.phase.downloading',
  verifying: 'update.phase.verifying',
  extracting: 'update.phase.extracting',
  installing: 'update.phase.installing',
  restarting: 'update.phase.restarting',
  complete: 'update.phase.complete',
};

function getPhaseLabel(phase: string, t: ReturnType<typeof useTranslation<'setup'>>['t']): string {
  const key = PHASE_KEYS[phase];
  return key ? t(key) : '';
}
