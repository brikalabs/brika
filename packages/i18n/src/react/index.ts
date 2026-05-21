/**
 * React entry — opt-in via `@brika/i18n/react`.
 *
 * Bundles the i18next bootstrap (`createI18n`), the typed translation hooks,
 * and a public `hydrateTranslations` seam for out-of-band data sources
 * (HMR pushers, SSR hydration). Apps call `createI18n()` once at startup
 * and consume the rest as React hooks.
 *
 * Hook split:
 *   - `useTranslate()` — `t`, `tp`, `locale`, `changeLocale`. Cheap.
 *   - `useIntl()`      — formatters + display names + clock preference. Heavier.
 *   - `useLocale()`    — composes both for callers that want everything.
 *
 * Requires the optional peer deps: `react`, `react-i18next`, `i18next`,
 * `i18next-browser-languagedetector`, `zod`.
 */

export {
  createI18n,
  hydrateTranslations,
  switchLanguage,
  type TranslationsBundle,
} from './client';
export {
  type DurationFormatOptions,
  type DurationInput,
  type LocaleUtils,
  type TimeFormat,
  useIntl,
  useLocale,
  useTranslate,
} from './use-locale';
export type { I18nT, I18nTp } from './use-translate';
