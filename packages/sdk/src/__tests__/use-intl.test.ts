/**
 * Tests for the useIntl() brick hook.
 *
 * Verifies that each formatter returns a correctly shaped IntlRef marker object.
 */

import { describe, expect, test } from 'bun:test';
import type { IntlRef } from '@brika/ui-kit';
import { useIntl } from '../brick-hooks/use-intl';

describe('useIntl', () => {
  const intl = useIntl();

  // ─── formatDate ──────────────────────────────────────────────────────────

  describe('formatDate', () => {
    test('creates dateTime ref from timestamp', () => {
      const ref = intl.formatDate(1700000000000);
      expect(ref).toEqual({
        __intl: true,
        type: 'dateTime',
        value: 1700000000000,
        options: { dateStyle: 'medium' },
      });
    });

    test('creates dateTime ref from Date object', () => {
      const date = new Date(0);
      const ref = intl.formatDate(date);
      expect(ref.value).toBe(0);
      expect(ref.type).toBe('dateTime');
    });

    test('merges custom options', () => {
      const ref = intl.formatDate(0, { dateStyle: 'long', weekday: 'long' }) as Extract<IntlRef, { type: 'dateTime' }>;
      expect(ref.options).toEqual({ dateStyle: 'long', weekday: 'long' });
    });
  });

  // ─── formatTime ──────────────────────────────────────────────────────────

  describe('formatTime', () => {
    test('creates dateTime ref with timeStyle default', () => {
      const ref = intl.formatTime(1700000000000);
      expect(ref).toEqual({
        __intl: true,
        type: 'dateTime',
        value: 1700000000000,
        options: { timeStyle: 'short' },
      });
    });

    test('converts Date object to timestamp', () => {
      const date = new Date(12345678);
      const ref = intl.formatTime(date);
      expect(ref.value).toBe(12345678);
    });

    test('custom options override defaults', () => {
      const ref = intl.formatTime(0, { timeStyle: 'long' }) as Extract<IntlRef, { type: 'dateTime' }>;
      expect(ref.options).toEqual({ timeStyle: 'long' });
    });
  });

  // ─── formatDateTime ──────────────────────────────────────────────────────

  describe('formatDateTime', () => {
    test('creates dateTime ref with both date and time defaults', () => {
      const ref = intl.formatDateTime(1700000000000);
      expect(ref).toEqual({
        __intl: true,
        type: 'dateTime',
        value: 1700000000000,
        options: { dateStyle: 'medium', timeStyle: 'short' },
      });
    });

    test('custom options override defaults', () => {
      const ref = intl.formatDateTime(0, { dateStyle: 'full', timeStyle: 'full' }) as Extract<IntlRef, { type: 'dateTime' }>;
      expect(ref.options).toEqual({ dateStyle: 'full', timeStyle: 'full' });
    });

    test('converts Date object to timestamp', () => {
      const date = new Date(99999);
      const ref = intl.formatDateTime(date);
      expect(ref.value).toBe(99999);
    });
  });

  // ─── formatNumber ────────────────────────────────────────────────────────

  describe('formatNumber', () => {
    test('creates number ref', () => {
      const ref = intl.formatNumber(42);
      expect(ref).toEqual({
        __intl: true,
        type: 'number',
        value: 42,
        options: undefined,
      });
    });

    test('includes custom options', () => {
      const ref = intl.formatNumber(3.14159, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) as Extract<IntlRef, { type: 'number' }>;
      expect(ref.options).toEqual({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });

    test('handles negative numbers', () => {
      const ref = intl.formatNumber(-99.9);
      expect(ref.value).toBe(-99.9);
    });
  });

  // ─── formatCurrency ──────────────────────────────────────────────────────

  describe('formatCurrency', () => {
    test('creates number ref with currency style', () => {
      const ref = intl.formatCurrency(9.99, 'USD');
      expect(ref).toEqual({
        __intl: true,
        type: 'number',
        value: 9.99,
        options: { style: 'currency', currency: 'USD' },
      });
    });

    test('supports different currencies', () => {
      const ref = intl.formatCurrency(1000, 'EUR') as Extract<IntlRef, { type: 'number' }>;
      expect(ref.options).toEqual({ style: 'currency', currency: 'EUR' });
    });
  });

  // ─── formatRelativeTime ──────────────────────────────────────────────────

  describe('formatRelativeTime', () => {
    test('creates relativeTime ref', () => {
      const ref = intl.formatRelativeTime(-1, 'day');
      expect(ref).toEqual({
        __intl: true,
        type: 'relativeTime',
        value: -1,
        unit: 'day',
      });
    });

    test('supports various units', () => {
      for (const unit of ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'] as const) {
        const ref = intl.formatRelativeTime(2, unit) as Extract<IntlRef, { type: 'relativeTime' }>;
        expect(ref.unit).toBe(unit);
      }
    });

    test('handles negative values', () => {
      const ref = intl.formatRelativeTime(-3, 'hour') as Extract<IntlRef, { type: 'relativeTime' }>;
      expect(ref.value).toBe(-3);
      expect(ref.unit).toBe('hour');
    });
  });

  // ─── formatList ──────────────────────────────────────────────────────────

  describe('formatList', () => {
    test('creates list ref with default options', () => {
      const ref = intl.formatList(['apples', 'oranges']);
      expect(ref).toEqual({
        __intl: true,
        type: 'list',
        value: ['apples', 'oranges'],
        options: { style: 'long', type: 'conjunction' },
      });
    });

    test('merges custom options', () => {
      const ref = intl.formatList(['a', 'b'], { type: 'disjunction' }) as Extract<IntlRef, { type: 'list' }>;
      expect(ref.options).toEqual({ style: 'long', type: 'disjunction' });
    });

    test('handles empty list', () => {
      const ref = intl.formatList([]);
      expect(ref.value).toEqual([]);
    });

    test('handles single item', () => {
      const ref = intl.formatList(['only']);
      expect(ref.value).toEqual(['only']);
    });
  });

  // ─── __intl marker ──────────────────────────────────────────────────────

  test('all formatters return objects with __intl: true', () => {
    const refs = [
      intl.formatDate(0),
      intl.formatTime(0),
      intl.formatDateTime(0),
      intl.formatNumber(0),
      intl.formatCurrency(0, 'USD'),
      intl.formatRelativeTime(0, 'second'),
      intl.formatList([]),
    ];
    for (const ref of refs) {
      expect(ref.__intl).toBe(true);
    }
  });
});
