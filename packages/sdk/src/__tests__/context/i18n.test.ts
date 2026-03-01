/**
 * Tests for the I18n context module.
 *
 * Verifies that setupI18n() returns a `t()` method that creates
 * I18nRef marker objects with the correct plugin namespace.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { isI18nRef } from '@brika/ui-kit';
import { setupI18n } from '../../context/i18n';
import { createTestHarness } from './_test-utils';

describe('setupI18n', () => {
  const h = createTestHarness({
    name: 'my-weather',
  });
  let t: ReturnType<typeof setupI18n>['methods']['t'];

  beforeEach(() => {
    h.reset();
    const result = setupI18n(h.core);
    t = result.methods.t;
  });

  test('t() returns an I18nRef with correct namespace', () => {
    const ref = t('stats.humidity');
    expect(isI18nRef(ref)).toBe(true);
    expect(ref.__i18n).toBe(true);
    expect(ref.ns).toBe('plugin:my-weather');
    expect(ref.key).toBe('stats.humidity');
  });

  test('t() without params leaves params undefined', () => {
    const ref = t('conditions.clearSky');
    expect(ref.params).toBeUndefined();
  });

  test('t() with params includes them in the ref', () => {
    const ref = t('ui.dayForecast', {
      count: 7,
    });
    expect(ref.key).toBe('ui.dayForecast');
    expect(ref.params).toEqual({
      count: 7,
    });
  });

  test('t() with string params works', () => {
    const ref = t('stats.feelsLikeTemp', {
      temp: '25°C',
    });
    expect(ref.params).toEqual({
      temp: '25°C',
    });
  });

  test('t() with mixed params works', () => {
    const ref = t('ui.locationDayForecast', {
      name: 'Montreal',
      count: 5,
    });
    expect(ref.params).toEqual({
      name: 'Montreal',
      count: 5,
    });
  });

  test('namespace is derived from manifest name', () => {
    const customHarness = createTestHarness({
      name: '@brika/plugin-timer',
    });
    const result = setupI18n(customHarness.core);
    const ref = result.methods.t('label');
    expect(ref.ns).toBe('plugin:@brika/plugin-timer');
  });

  test('stop() is a no-op and does not throw', () => {
    const result = setupI18n(h.core);
    expect(() => result.stop()).not.toThrow();
  });

  test('does not register any IPC handlers', () => {
    setupI18n(h.core);
    expect(h.client.on).not.toHaveBeenCalled();
    expect(h.client.implement).not.toHaveBeenCalled();
    expect(h.client.send).not.toHaveBeenCalled();
  });
});
