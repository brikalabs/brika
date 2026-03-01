/**
 * Tests for the useTranslation brick hook.
 *
 * Mocks the context module to verify that useTranslation()
 * delegates to ctx.t() correctly.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { I18nRef } from '@brika/ui-kit';

// Mock the context module
const mockT = mock(
  (key: string, params?: Record<string, string | number>): I18nRef => ({
    __i18n: true,
    ns: 'plugin:test-plugin',
    key,
    params,
  })
);

mock.module('../context', () => ({
  getContext: () => ({
    t: mockT,
  }),
}));

// Import after mocking
const { useTranslation } = await import('../brick-hooks/use-translation');

describe('useTranslation', () => {
  beforeEach(() => {
    mockT.mockClear();
  });

  test('returns an object with t function', () => {
    const result = useTranslation();
    expect(result).toHaveProperty('t');
    expect(typeof result.t).toBe('function');
  });

  test('t() delegates to context.t()', () => {
    const { t } = useTranslation();
    const ref = t('stats.humidity');
    expect(mockT).toHaveBeenCalledWith('stats.humidity', undefined);
    expect(ref.__i18n).toBe(true);
    expect(ref.key).toBe('stats.humidity');
  });

  test('t() passes params to context.t()', () => {
    const { t } = useTranslation();
    const ref = t('ui.dayForecast', {
      count: 7,
    });
    expect(mockT).toHaveBeenCalledWith('ui.dayForecast', {
      count: 7,
    });
    expect(ref.params).toEqual({
      count: 7,
    });
  });

  test('t() returns I18nRef with correct namespace', () => {
    const { t } = useTranslation();
    const ref = t('conditions.clearSky');
    expect(ref.ns).toBe('plugin:test-plugin');
  });
});
