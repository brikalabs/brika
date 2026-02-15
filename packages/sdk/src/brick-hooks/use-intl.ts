import type { IntlRef } from '@brika/ui-kit';
import { intlRef } from '@brika/ui-kit';

/**
 * Access locale-aware Intl formatters for brick components.
 *
 * Returns formatter functions that produce IntlRef marker objects.
 * The markers are resolved to formatted strings by the UI text renderer
 * using `Intl.*` APIs with the user's current locale.
 *
 * @example
 * ```tsx
 * const { formatDate, formatNumber } = useIntl();
 * <Text content={formatDate(Date.now())} />
 * <Text content={formatNumber(1234.5)} />
 * ```
 */
export function useIntl() {
  return {
    formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): IntlRef {
      return intlRef.dateTime(toMs(value), { dateStyle: 'medium', ...options });
    },
    formatTime(value: Date | number, options?: Intl.DateTimeFormatOptions): IntlRef {
      return intlRef.dateTime(toMs(value), { timeStyle: 'short', ...options });
    },
    formatDateTime(value: Date | number, options?: Intl.DateTimeFormatOptions): IntlRef {
      return intlRef.dateTime(toMs(value), { dateStyle: 'medium', timeStyle: 'short', ...options });
    },
    formatNumber(value: number, options?: Intl.NumberFormatOptions): IntlRef {
      return intlRef.number(value, options);
    },
    formatCurrency(value: number, currency: string): IntlRef {
      return intlRef.number(value, { style: 'currency', currency });
    },
    formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): IntlRef {
      return intlRef.relativeTime(value, unit);
    },
    formatList(items: string[], options?: Intl.ListFormatOptions): IntlRef {
      return intlRef.list(items, { style: 'long', type: 'conjunction', ...options });
    },
  };
}

function toMs(value: Date | number): number {
  return typeof value === 'number' ? value : value.getTime();
}
