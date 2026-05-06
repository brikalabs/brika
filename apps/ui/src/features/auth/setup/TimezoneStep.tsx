import { Check, Clock, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeFormatToggle } from '@/features/settings/components/time-format';
import { TimezonePicker } from '@/features/settings/components/timezone';
import {
  useHubTimezone,
  useUpdateHubTimezone,
} from '@/features/settings/components/timezone/hooks';
import { useLocale } from '@/lib/use-locale';
import { StepBody, StepHeader, StepNav } from './shared';

export function TimezoneStep() {
  const { t } = useTranslation('setup');
  const { formatTime } = useLocale();
  const { data } = useHubTimezone();
  const mutation = useUpdateHubTimezone();
  const current = data?.timezone ?? null;
  const autoDetected = useRef(false);

  // Auto-detect browser timezone on first visit if not yet configured
  const { mutate } = mutation;
  useEffect(() => {
    if (data && !data.timezone && !autoDetected.current) {
      autoDetected.current = true;
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      mutate(browserTz);
    }
  }, [data, mutate]);

  const localTime = current
    ? formatTime(new Date(), {
        timeZone: current,
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <StepHeader
        eyebrow={t('timezone.eyebrow')}
        title={t('timezone.title')}
        subtitle={t('timezone.subtitle')}
      />

      <StepBody>
        <div className="space-y-3">
          <TimezonePicker
            value={current}
            onChange={(tz) => mutation.mutate(tz)}
            placeholder={t('timezone.select')}
          />

          {current && (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Clock className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[13.5px]">{current.replaceAll('_', ' ')}</p>
                <p className="text-[11.5px] text-muted-foreground">{t('timezone.detected')}</p>
              </div>
              {localTime && (
                <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                  {localTime}
                </span>
              )}
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Check className="size-4 text-primary" />
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <span className="text-[11.5px] text-muted-foreground">{t('timezone.formatLabel')}</span>
            <TimeFormatToggle />
          </div>
        </div>

        <StepNav back="/setup/avatar" next="/setup/location" />
      </StepBody>
    </>
  );
}
