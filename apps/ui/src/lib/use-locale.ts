import i18next, { type TFunction, type TOptions } from 'i18next';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimeFormat } from './time-format';

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

export function useLocale() {
  const { t: baseT, i18n } = useTranslation(undefined, {
    useSuspense: true,
  });
  const { hour12 } = useTimeFormat();
  const locale = i18n.language;
  // For Intl formatters, use "en" as fallback when locale is "cimode"
  const intlLocale = locale === 'cimode' ? 'en' : locale;
  const nsSeparator = i18next.options.nsSeparator || ':';

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

  // i18next 25.x TFunction has 3 deeply-generic overloads; calling `baseT(key, options)`
  // from inside a generic wrapper cannot satisfy any of them without inference for
  // `Key`/`TOpt`/`InterpolationMap`. We treat `baseT` as a plain `(key, opts) => string`
  // here — the outer `useTranslation` already validated it, and TFunction inference is
  // restored for callers via the outer cast.
  const callBase = baseT as unknown as (key: string, options?: TOptions) => string;

  const t = useCallback(
    ((rawKey: string, options?: TOptions) => {
      if (locale === 'cimode') {
        return rawKey;
      }

      const ns = options?.ns as string | undefined;
      const effectiveNs = ns ?? extractNamespace(rawKey, nsSeparator);

      if (effectiveNs && !ns) {
        const key = rawKey.slice(rawKey.lastIndexOf(nsSeparator) + 1);
        return callBase(key, {
          ...options,
          ns: effectiveNs,
        });
      }

      return callBase(rawKey, options);
    }) as TFunction,
    [callBase, locale, nsSeparator]
  );

  const formatters = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(intlLocale, {
        dateStyle: 'medium',
      }),
      time: new Intl.DateTimeFormat(intlLocale, withHour12({ timeStyle: 'short' })),
      dateTime: new Intl.DateTimeFormat(
        intlLocale,
        withHour12({ dateStyle: 'medium', timeStyle: 'short' })
      ),
      relativeTime: new Intl.RelativeTimeFormat(intlLocale, {
        numeric: 'auto',
      }),
      number: new Intl.NumberFormat(intlLocale),
      list: new Intl.ListFormat(intlLocale, {
        style: 'long',
        type: 'conjunction',
      }),
      duration: new Intl.DurationFormat(intlLocale, {
        style: 'long',
      }),
      languageNames: new Intl.DisplayNames([intlLocale], {
        type: 'language',
      }),
      regionNames: new Intl.DisplayNames([intlLocale], {
        type: 'region',
      }),
    }),
    [intlLocale, withHour12]
  );

  return useMemo(
    () => ({
      t,
      locale,

      tp: (pluginId: string, key: string, defaultValue?: string) =>
        String(
          baseT(key, {
            ns: `plugin:${pluginId}`,
            defaultValue,
          })
        ),

      changeLocale: (loc: string) => i18n.changeLanguage(loc),

      formatDate: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, mergeDateOpts(opts)).format(date)
          : formatters.date.format(date),

      formatTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, mergeTimeOpts(withHour12(opts))).format(date)
          : formatters.time.format(date),

      formatDateTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, mergeDateTimeOpts(withHour12(opts))).format(date)
          : formatters.dateTime.format(date),

      formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
        formatters.relativeTime.format(value, unit),

      formatNumber: (value: number, opts?: Intl.NumberFormatOptions) =>
        opts
          ? new Intl.NumberFormat(intlLocale, opts).format(value)
          : formatters.number.format(value),

      formatCurrency: (value: number, currency: string) =>
        new Intl.NumberFormat(intlLocale, {
          style: 'currency',
          currency,
        }).format(value),

      formatDuration: (duration: DurationInput, opts?: DurationFormatOptions) =>
        opts
          ? new Intl.DurationFormat(intlLocale, {
              style: 'long',
              ...opts,
            }).format(duration)
          : formatters.duration.format(duration),

      formatList: (items: string[], opts?: Intl.ListFormatOptions) =>
        opts
          ? new Intl.ListFormat(intlLocale, {
              style: 'long',
              type: 'conjunction',
              ...opts,
            }).format(items)
          : formatters.list.format(items),

      getLanguageName: (code: string) => {
        if (code === 'cimode') {
          return '🔑 CI Mode (Keys)';
        }
        try {
          return formatters.languageNames.of(code) ?? code;
        } catch {
          return code;
        }
      },

      getRegionName: (code: string) => {
        try {
          return formatters.regionNames.of(code) ?? code;
        } catch {
          return code;
        }
      },
    }),
    [t, locale, intlLocale, i18n, formatters, withHour12]
  );
}

function extractNamespace(key: string, separator: string): string | undefined {
  const idx = key.lastIndexOf(separator);
  return idx > 0 ? key.slice(0, idx) : undefined;
}

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
  return {
    ...(hasDate ? {} : { dateStyle: 'medium' }),
    ...(hasTime ? {} : { timeStyle: 'short' }),
    ...opts,
  };
}

export type LocaleUtils = ReturnType<typeof useLocale>;
