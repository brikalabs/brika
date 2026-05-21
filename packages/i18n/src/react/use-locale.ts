/**
 * The package's canonical React hook. Bundles `useTranslate()` (translation
 * primitives) with `useIntl()` (locale-aware formatters + display names) so
 * components that need both — the common case — only call one hook.
 *
 * `useTranslate()` and `useIntl()` are the granular alternatives for components
 * that touch only one half of the API. `useIntl()` constructs the full
 * `Intl.*Format` family on every locale change; opt into it explicitly when
 * the cost is acceptable.
 */

import { useMemo } from 'react';
import { type UseIntlResult, useIntl } from './use-intl';
import { type UseTranslateResult, useTranslate } from './use-translate';

export type LocaleUtils = UseTranslateResult & UseIntlResult;

export function useLocale(): LocaleUtils {
  const translate = useTranslate();
  const intl = useIntl();
  return useMemo(() => ({ ...intl, ...translate }), [translate, intl]);
}

export type {
  DurationFormatOptions,
  DurationInput,
  TimeFormat,
  UseIntlResult,
} from './use-intl';
export { useIntl } from './use-intl';
export type { I18nT, I18nTp, UseTranslateResult } from './use-translate';
export { useTranslate } from './use-translate';
