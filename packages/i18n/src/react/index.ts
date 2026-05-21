/**
 * React entry — opt-in via `@brika/i18n/react`.
 *
 * Bundles the i18next bootstrap (`createI18n`), the typed translation hooks,
 * and the SSE live-update wiring. Apps call `createI18n()` once at startup
 * and consume the rest as React hooks.
 *
 * Hook split:
 *   - `useTranslate()` — `t`, `tp`, `locale`, `changeLocale`. Cheap.
 *   - `useIntl()`      — formatters + display names + clock preference. Heavier.
 *   - `useLocale()`    — composition of both. Back-compat.
 *
 * Requires the optional peer deps: `react`, `react-i18next`, `i18next`,
 * `i18next-browser-languagedetector`, `zod`.
 */

export {
  type CreateI18nOptions,
  createI18n,
  disposeI18n,
  getLoadedLanguages,
  prefetchBundle,
  reloadTranslations,
  switchLanguage,
} from './client';
export {
  type DurationFormatOptions,
  type DurationInput,
  type LocaleUtils,
  type TimeFormat,
  useIntl,
  type UseIntlResult,
  useLocale,
  useTranslate,
  type UseTranslateResult,
} from './use-locale';
export type { I18nT, I18nTp } from './use-translate';
