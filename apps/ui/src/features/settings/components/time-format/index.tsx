import { cn } from '@brika/clay';
import type { TimeFormat } from '@/lib/time-format';
import { useLocale } from '@/lib/use-locale';

// ─── Toggle (reusable) ──────────────────────────────────────────────────────

interface TimeFormatToggleProps {
  className?: string;
}

const OPTIONS: readonly { value: TimeFormat; labelKey: string }[] = [
  { value: 'auto', labelKey: 'settings:timeFormat.auto' },
  { value: 'h12', labelKey: 'settings:timeFormat.h12' },
  { value: 'h24', labelKey: 'settings:timeFormat.h24' },
] as const;

export function TimeFormatToggle({ className }: Readonly<TimeFormatToggleProps>) {
  const { t, timeFormat, setTimeFormat } = useLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t('settings:timeFormat.title')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-foreground/[0.025] p-0.5',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const isActive = timeFormat === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTimeFormat(option.value)}
            className={cn(
              'rounded-sm px-3 py-1 font-medium text-[12px] transition-all',
              isActive
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Auto preview hint ──────────────────────────────────────────────────────

/** Renders the active locale's "auto" sample (e.g. "3:45 PM" or "15:45") */
export function TimeFormatAutoHint() {
  const { t, locale } = useLocale();
  const sample = new Intl.DateTimeFormat(locale === 'cimode' ? 'en' : locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(2000, 0, 1, 15, 45));

  return (
    <span className="font-mono text-[11px] text-muted-foreground/70">
      {t('settings:timeFormat.autoHint', { example: sample })}
    </span>
  );
}
