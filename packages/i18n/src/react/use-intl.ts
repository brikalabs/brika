/**
 * Intl-formatter hook. Exposes the locale-aware `Intl.*Format` family plus
 * the user's clock-format preference. Components that only need translation
 * strings should use `useTranslate()` instead — this hook constructs eight
 * `Intl.*Format` instances per locale change.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimeFormatStore } from './use-time-format';

export interface DurationFormatOptions {
  style?: 'long' | 'short' | 'narrow' | 'digital';
}

export interface DurationInput {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

export interface UseIntlResult {
  readonly locale: string;
  readonly timeFormat: ReturnType<typeof useTimeFormatStore>['preference'];
  readonly setTimeFormat: ReturnType<typeof useTimeFormatStore>['setPreference'];
  readonly formatDate: (date: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  readonly formatTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  readonly formatDateTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  readonly formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
  readonly formatNumber: (value: number, opts?: Intl.NumberFormatOptions) => string;
  readonly formatCurrency: (value: number, currency: string) => string;
  readonly formatDuration: (duration: DurationInput, opts?: DurationFormatOptions) => string;
  readonly formatList: (items: string[], opts?: Intl.ListFormatOptions) => string;
  readonly getLanguageName: (code: string) => string;
  readonly getRegionName: (code: string) => string;
}

export function useIntl(): UseIntlResult {
  const { i18n } = useTranslation(undefined, {
    useSuspense: true,
  });
  const { preference: timeFormat, setPreference: setTimeFormat, hour12 } = useTimeFormatStore();
  const locale = i18n.language;
  // For Intl formatters, use "en" as fallback when locale is "cimode"
  const intlLocale = locale === 'cimode' ? 'en' : locale;

  /** Apply the user's hour12 preference unless explicit opts override it. */
  const withHour12 = useCallback(
    (opts: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions => {
      if (hour12 === undefined || 'hour12' in opts) {
        return opts;
      }
      return { ...opts, hour12 };
    },
    [hour12]
  );

  const formatters = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }),
      time: new Intl.DateTimeFormat(intlLocale, withHour12({ timeStyle: 'short' })),
      dateTime: new Intl.DateTimeFormat(
        intlLocale,
        withHour12({ dateStyle: 'medium', timeStyle: 'short' })
      ),
      relativeTime: new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' }),
      number: new Intl.NumberFormat(intlLocale),
      list: new Intl.ListFormat(intlLocale, { style: 'long', type: 'conjunction' }),
      duration: new Intl.DurationFormat(intlLocale, { style: 'long' }),
      languageNames: new Intl.DisplayNames([intlLocale], { type: 'language' }),
      regionNames: new Intl.DisplayNames([intlLocale], { type: 'region' }),
    }),
    [intlLocale, withHour12]
  );

  return useMemo<UseIntlResult>(
    () => ({
      locale,
      timeFormat,
      setTimeFormat,

      formatDate: (date, opts) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, mergeDateOpts(opts)).format(date)
          : formatters.date.format(date),

      formatTime: (date, opts) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, mergeTimeOpts(withHour12(opts))).format(date)
          : formatters.time.format(date),

      formatDateTime: (date, opts) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, mergeDateTimeOpts(withHour12(opts))).format(date)
          : formatters.dateTime.format(date),

      formatRelativeTime: (value, unit) => formatters.relativeTime.format(value, unit),

      formatNumber: (value, opts) =>
        opts
          ? new Intl.NumberFormat(intlLocale, opts).format(value)
          : formatters.number.format(value),

      formatCurrency: (value, currency) =>
        new Intl.NumberFormat(intlLocale, {
          style: 'currency',
          currency,
        }).format(value),

      formatDuration: (duration, opts) =>
        opts
          ? new Intl.DurationFormat(intlLocale, { style: 'long', ...opts }).format(duration)
          : formatters.duration.format(duration),

      formatList: (items, opts) =>
        opts
          ? new Intl.ListFormat(intlLocale, {
              style: 'long',
              type: 'conjunction',
              ...opts,
            }).format(items)
          : formatters.list.format(items),

      getLanguageName: (code) => {
        if (code === 'cimode') {
          return 'CI Mode (Keys)';
        }
        try {
          return formatters.languageNames.of(code) ?? code;
        } catch {
          return code;
        }
      },

      getRegionName: (code) => {
        try {
          return formatters.regionNames.of(code) ?? code;
        } catch {
          return code;
        }
      },
    }),
    [locale, timeFormat, setTimeFormat, intlLocale, formatters, withHour12]
  );
}

export type { TimeFormat } from './use-time-format';

// `dateStyle` / `timeStyle` cannot be combined with individual component props
// (year/month/day/hour/minute/second). These helpers apply our default style
// only when the caller hasn't asked for fine-grained control.

const TIME_COMPONENT_KEYS = ['timeStyle', 'hour', 'minute', 'second'] as const;
const DATE_COMPONENT_KEYS = ['dateStyle', 'year', 'month', 'day', 'weekday'] as const;

function hasAny(opts: Intl.DateTimeFormatOptions, keys: readonly string[]): boolean {
  return keys.some((k) => k in opts);
}

function mergeDateOpts(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return hasAny(opts, DATE_COMPONENT_KEYS) ? opts : { dateStyle: 'medium', ...opts };
}

function mergeTimeOpts(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return hasAny(opts, TIME_COMPONENT_KEYS) ? opts : { timeStyle: 'short', ...opts };
}

function mergeDateTimeOpts(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const hasDate = hasAny(opts, DATE_COMPONENT_KEYS);
  const hasTime = hasAny(opts, TIME_COMPONENT_KEYS);
  // Intl.DateTimeFormat throws when dateStyle/timeStyle coexist with any
  // component-level option. If the caller opted in to fine-grained options
  // on one side, leave the other side alone instead of injecting a *Style
  // that would conflict.
  if (hasDate !== hasTime) {
    return opts;
  }
  return {
    ...(hasDate ? {} : { dateStyle: 'medium', timeStyle: 'short' }),
    ...opts,
  };
}
