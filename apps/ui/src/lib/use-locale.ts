import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction, type TOptions } from "i18next";

interface DurationFormatOptions {
  style?: "long" | "short" | "narrow" | "digital";
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
  const nsSeparator = i18next.options.nsSeparator || ":";

  const t = useCallback(
    ((rawKey: string, options?: TOptions) => {
      const ns = options?.ns as string | undefined;
      const effectiveNs = ns ?? extractNamespace(rawKey, nsSeparator);

      if (effectiveNs && !i18next.hasResourceBundle(locale, effectiveNs)) {
        throw i18next.loadNamespaces(effectiveNs);
      }

      if (effectiveNs && !ns) {
        const key = rawKey.slice(rawKey.lastIndexOf(nsSeparator) + 1);
        return baseT(key, { ...options, ns: effectiveNs });
      }

      return baseT(rawKey, options);
    }) as TFunction,
    [baseT, locale, nsSeparator],
  );

  const formatters = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
      time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }),
      dateTime: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
      relativeTime: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
      number: new Intl.NumberFormat(locale),
      list: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }),
      duration: new Intl.DurationFormat(locale, { style: "long" }),
      languageNames: new Intl.DisplayNames([locale], { type: "language" }),
      regionNames: new Intl.DisplayNames([locale], { type: "region" }),
    }),
    [locale],
  );

  return useMemo(
    () => ({
      t,
      locale,

      tp: (pluginId: string, key: string, defaultValue?: string) =>
        t(key, { ns: `plugin:${pluginId}`, defaultValue }),

      changeLocale: (loc: string) => i18n.changeLanguage(loc),

      formatDate: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...opts }).format(date) : formatters.date.format(date),

      formatTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts ? new Intl.DateTimeFormat(locale, { timeStyle: "short", ...opts }).format(date) : formatters.time.format(date),

      formatDateTime: (date: Date | number, opts?: Intl.DateTimeFormatOptions) =>
        opts ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", ...opts }).format(date) : formatters.dateTime.format(date),

      formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
        formatters.relativeTime.format(value, unit),

      formatNumber: (value: number, opts?: Intl.NumberFormatOptions) =>
        opts ? new Intl.NumberFormat(locale, opts).format(value) : formatters.number.format(value),

      formatCurrency: (value: number, currency: string) =>
        new Intl.NumberFormat(locale, { style: "currency", currency }).format(value),

      formatDuration: (duration: DurationInput) => formatters.duration.format(duration),

      formatList: (items: string[], opts?: Intl.ListFormatOptions) =>
        opts ? new Intl.ListFormat(locale, { style: "long", type: "conjunction", ...opts }).format(items) : formatters.list.format(items),

      getLanguageName: (code: string) => {
        if (code === "cimode") return "🔑 CI Mode (Keys)";
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
    [t, locale, i18n, formatters],
  );
}

function extractNamespace(key: string, separator: string): string | undefined {
  const idx = key.lastIndexOf(separator);
  return idx > 0 ? key.slice(0, idx) : undefined;
}

export type LocaleUtils = ReturnType<typeof useLocale>;
