/**
 * Tests for the useLocale() brick hook.
 *
 * Verifies t() delegates to context, and all Intl formatters
 * return correctly shaped marker objects.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { I18nRef, IntlRef } from '@brika/ui-kit';

// Mock the context module
const mockT = mock((key: string, params?: Record<string, string | number>): I18nRef => ({
  __i18n: true,
  ns: 'plugin:test-plugin',
  key,
  params,
}));

mock.module('../context', () => ({
  getContext: () => ({ t: mockT }),
}));

// Import after mocking
const { useLocale } = await import('../brick-hooks/use-locale');

describe('useLocale', () => {
  beforeEach(() => {
    mockT.mockClear();
  });

  // ─── t() — translation delegation ────────────────────────────────────────

  describe('t()', () => {
    test('returns an I18nRef', () => {
      const { t } = useLocale();
      const ref = t('stats.humidity');
      expect(ref.__i18n).toBe(true);
      expect(ref.key).toBe('stats.humidity');
    });

    test('delegates to context.t()', () => {
      const { t } = useLocale();
      t('stats.wind');
      expect(mockT).toHaveBeenCalledWith('stats.wind', undefined);
    });

    test('passes params through', () => {
      const { t } = useLocale();
      const ref = t('ui.dayForecast', { count: 5 });
      expect(mockT).toHaveBeenCalledWith('ui.dayForecast', { count: 5 });
      expect(ref.params).toEqual({ count: 5 });
    });
  });

  // ─── formatDate ──────────────────────────────────────────────────────────

  describe('formatDate', () => {
    test('creates dateTime ref with dateStyle default', () => {
      const { formatDate } = useLocale();
      expect(formatDate(1700000000000)).toEqual({
        __intl: true,
        type: 'dateTime',
        value: 1700000000000,
        options: { dateStyle: 'medium' },
      });
    });

    test('converts Date to timestamp', () => {
      const { formatDate } = useLocale();
      const ref = formatDate(new Date(0));
      expect(ref.value).toBe(0);
    });

    test('merges custom options', () => {
      const { formatDate } = useLocale();
      const ref = formatDate(0, { dateStyle: 'long' }) as Extract<IntlRef, { type: 'dateTime' }>;
      expect(ref.options).toEqual({ dateStyle: 'long' });
    });
  });

  // ─── formatTime ──────────────────────────────────────────────────────────

  describe('formatTime', () => {
    test('creates dateTime ref with timeStyle default', () => {
      const { formatTime } = useLocale();
      expect(formatTime(1700000000000)).toEqual({
        __intl: true,
        type: 'dateTime',
        value: 1700000000000,
        options: { timeStyle: 'short' },
      });
    });

    test('converts Date to timestamp', () => {
      const { formatTime } = useLocale();
      expect(formatTime(new Date(5000)).value).toBe(5000);
    });
  });

  // ─── formatDateTime ────────────────────────────────────────────────────

  describe('formatDateTime', () => {
    test('creates dateTime ref with both defaults', () => {
      const { formatDateTime } = useLocale();
      expect(formatDateTime(0)).toEqual({
        __intl: true,
        type: 'dateTime',
        value: 0,
        options: { dateStyle: 'medium', timeStyle: 'short' },
      });
    });

    test('custom options override defaults', () => {
      const { formatDateTime } = useLocale();
      const ref = formatDateTime(0, { dateStyle: 'full', timeStyle: 'full' }) as Extract<IntlRef, { type: 'dateTime' }>;
      expect(ref.options).toEqual({ dateStyle: 'full', timeStyle: 'full' });
    });
  });

  // ─── formatNumber ────────────────────────────────────────────────────────

  describe('formatNumber', () => {
    test('creates number ref', () => {
      const { formatNumber } = useLocale();
      expect(formatNumber(42)).toEqual({
        __intl: true,
        type: 'number',
        value: 42,
        options: undefined,
      });
    });

    test('includes custom options', () => {
      const { formatNumber } = useLocale();
      const ref = formatNumber(3.14, { minimumFractionDigits: 2 }) as Extract<IntlRef, { type: 'number' }>;
      expect(ref.options).toEqual({ minimumFractionDigits: 2 });
    });
  });

  // ─── formatCurrency ──────────────────────────────────────────────────────

  describe('formatCurrency', () => {
    test('creates number ref with currency style', () => {
      const { formatCurrency } = useLocale();
      expect(formatCurrency(9.99, 'USD')).toEqual({
        __intl: true,
        type: 'number',
        value: 9.99,
        options: { style: 'currency', currency: 'USD' },
      });
    });
  });

  // ─── formatRelativeTime ──────────────────────────────────────────────────

  describe('formatRelativeTime', () => {
    test('creates relativeTime ref', () => {
      const { formatRelativeTime } = useLocale();
      expect(formatRelativeTime(-1, 'day')).toEqual({
        __intl: true,
        type: 'relativeTime',
        value: -1,
        unit: 'day',
      });
    });

    test('supports various units', () => {
      const { formatRelativeTime } = useLocale();
      for (const unit of ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'] as const) {
        const ref = formatRelativeTime(2, unit) as Extract<IntlRef, { type: 'relativeTime' }>;
        expect(ref.unit).toBe(unit);
      }
    });
  });

  // ─── formatList ──────────────────────────────────────────────────────────

  describe('formatList', () => {
    test('creates list ref with default options', () => {
      const { formatList } = useLocale();
      expect(formatList(['a', 'b'])).toEqual({
        __intl: true,
        type: 'list',
        value: ['a', 'b'],
        options: { style: 'long', type: 'conjunction' },
      });
    });

    test('merges custom options', () => {
      const { formatList } = useLocale();
      const ref = formatList(['x'], { type: 'disjunction' }) as Extract<IntlRef, { type: 'list' }>;
      expect(ref.options).toEqual({ style: 'long', type: 'disjunction' });
    });
  });

  // ─── All formatters return __intl: true ────────────────────────────────

  test('all formatters return objects with __intl: true', () => {
    const locale = useLocale();
    const refs = [
      locale.formatDate(0),
      locale.formatTime(0),
      locale.formatDateTime(0),
      locale.formatNumber(0),
      locale.formatCurrency(0, 'USD'),
      locale.formatRelativeTime(0, 'second'),
      locale.formatList([]),
    ];
    for (const ref of refs) {
      expect(ref.__intl).toBe(true);
    }
  });

  // ─── Single hook returns all methods ───────────────────────────────────

  test('returns t and all formatters in a single object', () => {
    const locale = useLocale();
    expect(typeof locale.t).toBe('function');
    expect(typeof locale.formatDate).toBe('function');
    expect(typeof locale.formatTime).toBe('function');
    expect(typeof locale.formatDateTime).toBe('function');
    expect(typeof locale.formatNumber).toBe('function');
    expect(typeof locale.formatCurrency).toBe('function');
    expect(typeof locale.formatRelativeTime).toBe('function');
    expect(typeof locale.formatList).toBe('function');
  });
});
