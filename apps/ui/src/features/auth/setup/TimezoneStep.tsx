import { Check, Clock, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { TimezonePicker } from '@/features/settings/components/timezone';
import {
  useHubTimezone,
  useUpdateHubTimezone,
} from '@/features/settings/components/timezone/hooks';
import { StepBody, StepHeader, StepNav } from './shared';

export function TimezoneStep() {
  const { t } = useTranslation('setup');
  const { data } = useHubTimezone();
  const mutation = useUpdateHubTimezone();
  const current = data?.timezone ?? null;
  const autoDetected = useRef(false);

  // Auto-detect browser timezone on first visit if not yet configured
  useEffect(() => {
    if (data && !data.timezone && !autoDetected.current) {
      autoDetected.current = true;
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      mutation.mutate(browserTz);
    }
  }, [data, mutation]);

  return (
    <>
      <StepHeader
        icon={Clock}
        title={t('timezone.title')}
        description={t('timezone.description')}
      />

      <StepBody>
        <div className="space-y-4">
          <TimezonePicker
            value={current}
            onChange={(tz) => mutation.mutate(tz)}
            placeholder={t('timezone.select')}
          />

          {current && (
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Clock className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{current.replace(/_/g, ' ')}</p>
                <p className="text-muted-foreground text-xs">{t('timezone.detected')}</p>
              </div>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Check className="size-4 text-primary" />
              )}
            </div>
          )}
        </div>

        <StepNav back="/setup/avatar" next="/setup/location" />
      </StepBody>
    </>
  );
}
