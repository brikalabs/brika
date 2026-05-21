/**
 * Back-compat composition hook: merges `useTranslate()` and `useIntl()`.
 *
 * New code should prefer the focused hooks — `useTranslate()` if you only need
 * `t` / `tp`, `useIntl()` if you only need locale-aware formatters — because
 * they avoid constructing the full `Intl.*Format` family on every locale change.
 *
 * `useLocale()` is preserved for callers that want everything in one shape,
 * and as the historical entry point.
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
