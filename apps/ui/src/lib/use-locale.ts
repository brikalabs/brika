import i18next, { type TFunction, type TOptions } from 'i18next';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface DurationFormatOptions {
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

declare global {
  // biome-ignore lint/style/noNamespace: Required for Intl.DurationFormat polyfill type
  namespace Intl {
    class DurationFormat {
      constructor(locale?: string | string[], options?: DurationFormatOptions);

      format(duration: DurationInput): string;
    }
  }
}

export function useLocale() {
  const { t: baseT, i18n } = useTranslation(undefined, { useSuspense: true });
  const locale = i18n.language;
  // For Intl formatters, use "en" as fallback when locale is "cimode"
  const intlLocale = locale === 'cimode' ? 'en' : locale;
  const nsSeparator = i18next.options.nsSeparator || ':';

  const t = useCallback(
    ((rawKey: string, options?: TOptions) => {
      if (locale === 'cimode') return rawKey;

      const ns = options?.ns as string | undefined;
      const effectiveNs = ns ?? extractNamespace(rawKey, nsSeparator);

      if (effectiveNs && !ns) {
        const key = rawKey.slice(rawKey.lastIndexOf(nsSeparator) + 1);
        return baseT(key, { ...options, ns: effectiveNs });
      }

      return baseT(rawKey, options);
    }) as TFunction,
    [baseT, locale, nsSeparator]
  );

  const formatters = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }),
      time: new Intl.DateTimeFormat(intlLocale, { timeStyle: 'short' }),
      dateTime: new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' }),
      relativeTime: new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' }),
      number: new Intl.NumberFormat(intlLocale),
      list: new Intl.ListFormat(intlLocale, { style: 'long', type: 'conjunction' }),
      duration: new Intl.DurationFormat(intlLocale, { style: 'long' }),
      languageNames: new Intl.DisplayNames([intlLocale], { type: 'language' }),
      regionNames: new Intl.DisplayNames([intlLocale], { type: 'region' }),
    }),
    [intlLocale]
  );

  return useMemo(
    () => ({
      t,
      locale,

      tp: (pluginId: string, key: string, defaultValue?: string) =>
        baseT(key, { ns: `plugin:${pluginId}`, defaultValue }) as string,

      changeLocale: (loc: string) => i18n.changeLanguage(loc),

      formatDate: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', ...opts }).format(date)
          : formatters.date.format(date),

      formatTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, { timeStyle: 'short', ...opts }).format(date)
          : formatters.time.format(date),

      formatDateTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts
          ? new Intl.DateTimeFormat(intlLocale, {
              dateStyle: 'medium',
              timeStyle: 'short',
              ...opts,
            }).format(date)
          : formatters.dateTime.format(date),

      formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
        formatters.relativeTime.format(value, unit),

      formatNumber: (value: number, opts?: Intl.NumberFormatOptions) =>
        opts
          ? new Intl.NumberFormat(intlLocale, opts).format(value)
          : formatters.number.format(value),

      formatCurrency: (value: number, currency: string) =>
        new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(value),

      formatDuration: (duration: DurationInput) => formatters.duration.format(duration),

      formatList: (items: string[], opts?: Intl.ListFormatOptions) =>
        opts
          ? new Intl.ListFormat(intlLocale, {
              style: 'long',
              type: 'conjunction',
              ...opts,
            }).format(items)
          : formatters.list.format(items),

      getLanguageName: (code: string) => {
        if (code === 'cimode') return '🔑 CI Mode (Keys)';
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
    [t, locale, intlLocale, i18n, formatters]
  );
}

function extractNamespace(key: string, separator: string): string | undefined {
  const idx = key.lastIndexOf(separator);
  return idx > 0 ? key.slice(0, idx) : undefined;
}

export type LocaleUtils = ReturnType<typeof useLocale>;
