import { Check, Clock, Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { TimeFormatAutoHint, TimeFormatToggle } from '../components/time-format';
import { TimezonePicker } from '../components/timezone';
import { useHubTimezone, useUpdateHubTimezone } from '../components/timezone/hooks';
import { PageHeader, SettingsSection } from './primitives';

export function TimePage() {
  const { t, formatTime } = useLocale();
  const { data } = useHubTimezone();
  const mutation = useUpdateHubTimezone();
  const current = data?.timezone ?? null;

  const localTime = current
    ? formatTime(new Date(), {
        timeZone: current,
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.preferences')}
        title={t('settings:time.title')}
        description={t('settings:time.description')}
      />

      <div className="space-y-4">
        <SettingsSection
          icon={Clock}
          title={t('settings:timezone.title')}
          description={t('settings:timezone.description')}
        >
          <TimezonePicker
            value={current}
            onChange={(tz) => mutation.mutate(tz)}
            placeholder={t('settings:timezone.select')}
          />

          {current && (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Clock className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[13.5px]">{current.replaceAll('_', ' ')}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {t('settings:timezone.title')}
                </p>
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
        </SettingsSection>

        <SettingsSection
          icon={Clock}
          title={t('settings:timeFormat.title')}
          description={t('settings:timeFormat.description')}
        >
          <div className="flex flex-wrap items-center gap-3">
            <TimeFormatToggle />
            <TimeFormatAutoHint />
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
