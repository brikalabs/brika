import { useIntl } from './use-intl';
import { useTranslation } from './use-translation';

/**
 * Unified locale hook for brick components — translations + Intl formatters.
 *
 * Composes `useTranslation()` and `useIntl()` into a single API.
 * Returns `t()` for translations and `format*()` for locale-aware formatting.
 * All return marker objects resolved by the UI text renderer.
 *
 * @example
 * ```tsx
 * const { t, formatDate, formatNumber } = useLocale();
 * <Text content={t('stats.humidity')} />
 * <Text content={formatDate(Date.now())} />
 * <Text content={formatNumber(1234.5)} />
 * ```
 */
export function useLocale() {
  const { t } = useTranslation();
  return { t, ...useIntl() };
}
