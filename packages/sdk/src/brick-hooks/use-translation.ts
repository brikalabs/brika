import type { I18nRef } from '@brika/ui-kit';
import { getContext } from '../context';

/**
 * Access the translation function for the current plugin.
 *
 * Returns `{ t }` where `t(key, params?)` produces an I18nRef marker.
 * The marker is resolved to translated text by the UI text renderer
 * using i18next on the frontend.
 *
 * @example
 * ```tsx
 * const { t } = useTranslation();
 * <Text content={t('stats.humidity')} />
 * <Text content={t('ui.dayForecast', { count: 7 })} />
 * ```
 */
export function useTranslation(): {
  t: (key: string, params?: Record<string, string | number>) => I18nRef;
} {
  const ctx = getContext();
  return { t: (key, params) => ctx.t(key, params) };
}
