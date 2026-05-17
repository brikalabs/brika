/**
 * Onboarding "Update" step.
 *
 * Sits between `location` and `complete`. Asks the hub once whether a
 * newer release is available:
 *   - up to date / dev build / check failed → auto-skip to `/setup/complete`
 *     (we don't want to slow new users down with extra clicks).
 *   - update available → render the version diff with two buttons:
 *       "Update now" → runs the in-place updater and waits for restart
 *       "Skip for now" → moves on to `/setup/complete`.
 *   - docker runtime → show the pull guidance and a Skip button
 *     (apply is disabled).
 *
 * The "Update now" path mirrors the UpdateDialog flow: SSE progress,
 * hub-restart poller, then a full page reload (which puts the user back
 * on the running setup; the onboarding state is already on the hub).
 */

import { Button } from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { ArrowDownToLine, ArrowRight, Sparkles, Tag, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateCheck } from '@/features/updates';
import { type HubUpdateInfo, type UpdateProgress, updateApi } from '@/features/updates/api';
import { useWaitForHub } from '@/hooks/use-wait-for-hub';
import { Eyebrow, StepBody, StepHeader, StepNav } from './shared';

type StepState =
  | 'loading'
  | 'no-update'
  | 'available'
  | 'docker'
  | 'updating'
  | 'restarting'
  | 'error';

const DOCKER_COMMAND = 'docker pull ghcr.io/brikalabs/brika:latest && docker compose up -d';

function pickInitialState(data: HubUpdateInfo | undefined): StepState {
  if (!data) {
    return 'loading';
  }
  if (data.runtime === 'docker' && data.updateAvailable) {
    return 'docker';
  }
  if (!data.updateAvailable) {
    return 'no-update';
  }
  return 'available';
}

export function UpdateStep() {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();
  const { data, isLoading } = useUpdateCheck();
  const [state, setState] = useState<StepState>('loading');
  const [phaseMessage, setPhaseMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const hubPoller = useWaitForHub(
    useCallback(() => {
      setError(t('update.restartTimeout'));
      setState('error');
    }, [t])
  );

  // Reflect the query state into local UI state once data lands. We skip
  // automatically when there's nothing to show — this keeps the step
  // invisible for the 99% who are on the latest version.
  useEffect(() => {
    if (state !== 'loading') {
      return;
    }
    if (isLoading) {
      return;
    }
    const next = pickInitialState(data);
    if (next === 'no-update') {
      navigate({ to: '/setup/complete', replace: true });
      return;
    }
    setState(next);
  }, [data, isLoading, navigate, state]);

  const handleUpdate = useCallback(async () => {
    setState('updating');
    setPhaseMessage(t('update.preparing'));
    setError(null);
    try {
      const stream = await updateApi.applyStream();
      stream.onProgress((p: UpdateProgress) => {
        if (p.message) {
          setPhaseMessage(p.message);
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
  }, [hubPoller, t]);

  const handleSkip = useCallback(() => {
    navigate({ to: '/setup/complete' });
  }, [navigate]);

  if (state === 'loading') {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.title')}
          subtitle={t('update.checking')}
        />
        <StepBody>
          <div className="flex justify-center py-6">
            <Sparkles className="size-6 animate-pulse text-muted-foreground" />
          </div>
          <StepNav back="/setup/location" next="/setup/complete" continueLabel={t('update.skip')} />
        </StepBody>
      </>
    );
  }

  if (state === 'docker' && data) {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={t('update.dockerTitle')}
          subtitle={t('update.dockerSubtitle', {
            current: data.currentVersion,
            latest: data.latestVersion,
          })}
        />
        <StepBody>
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <Terminal className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {t('update.dockerHelp')}
              </p>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-[12px]">
              {DOCKER_COMMAND}
            </pre>
          </div>
          <StepNav
            back="/setup/location"
            onContinue={handleSkip}
            continueLabel={t('update.continueAnyway')}
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
          <VersionDiff current={data.currentVersion} latest={data.latestVersion} />
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
            <Button size="lg" variant="outline" className="flex-1 gap-2" onClick={handleSkip}>
              {t('update.skip')}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </StepBody>
      </>
    );
  }

  if (state === 'updating' || state === 'restarting') {
    return (
      <>
        <StepHeader
          eyebrow={t('update.eyebrow')}
          title={state === 'restarting' ? t('update.restarting') : t('update.applying')}
          subtitle={state === 'restarting' ? t('update.waitingForHub') : phaseMessage}
        />
        <StepBody>
          <div className="flex flex-col items-center gap-3 py-8">
            <Sparkles className="size-6 animate-pulse text-primary" />
            <Eyebrow>{phaseMessage}</Eyebrow>
          </div>
        </StepBody>
      </>
    );
  }

  // Fallback (no-update raced past the redirect)
  return null;
}

function VersionDiff({ current, latest }: Readonly<{ current: string; latest: string }>) {
  return (
    <div className="flex items-center justify-center gap-5 rounded-lg border bg-muted/30 py-5">
      <div className="text-center">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.18em]">current</p>
        <div className="mt-1 flex items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" />
          <span className="font-mono font-semibold">v{current}</span>
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground" />
      <div className="text-center">
        <p className="text-[10px] text-primary uppercase tracking-[0.18em]">latest</p>
        <div className="mt-1 flex items-center gap-1.5">
          <Tag className="size-3.5 text-primary" />
          <span className="font-mono font-semibold text-primary">v{latest}</span>
        </div>
      </div>
    </div>
  );
}
