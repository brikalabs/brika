/**
 * Tests for weather plugin utility functions.
 *
 * 100% coverage for: getWeatherMeta, getGradient, getConditionColor,
 * formatTemp, tempUnit, windDirectionLabel, dayName.
 */

import { describe, expect, test } from 'bun:test';
import { createMockTranslation } from '@brika/sdk/testing';
import type { WeatherCondition } from '../utils';
import {
  dayName,
  formatTemp,
  formatTempWithUnit,
  getConditionColor,
  getGradient,
  getWeatherMeta,
  getWeatherVisuals,
  tempUnit,
  windDirectionLabel,
} from '../utils';

// ─── getWeatherMeta ─────────────────────────────────────────────────────────

describe('getWeatherMeta', () => {
  test('code 0 → clear sky', () => {
    const meta = getWeatherMeta(0);
    expect(meta.condition).toBe('clear');
    expect(meta.labelKey).toBe('conditions.clearSky');
    expect(meta.icon).toBe('sun');
  });

  test('code 1 → mainly clear', () => {
    const meta = getWeatherMeta(1);
    expect(meta.condition).toBe('partly-cloudy');
    expect(meta.labelKey).toBe('conditions.mainlyClear');
  });

  test('code 2 → partly cloudy', () => {
    expect(getWeatherMeta(2).condition).toBe('partly-cloudy');
  });

  test('code 3 → overcast', () => {
    expect(getWeatherMeta(3).condition).toBe('cloudy');
    expect(getWeatherMeta(3).icon).toBe('cloud');
  });

  test('code 45 → fog', () => {
    expect(getWeatherMeta(45).condition).toBe('fog');
  });

  test('code 48 → rime fog', () => {
    expect(getWeatherMeta(48).condition).toBe('fog');
    expect(getWeatherMeta(48).labelKey).toBe('conditions.rimeFog');
  });

  test('codes 51-57 → drizzle variants', () => {
    for (const code of [51, 53, 55, 56, 57]) {
      expect(getWeatherMeta(code).condition).toBe('drizzle');
      expect(getWeatherMeta(code).icon).toBe('cloud-drizzle');
    }
  });

  test('codes 61-67 → rain variants', () => {
    for (const code of [61, 63, 65, 66, 67]) {
      expect(getWeatherMeta(code).condition).toBe('rain');
      expect(getWeatherMeta(code).icon).toBe('cloud-rain');
    }
  });

  test('codes 71-77 → snow variants', () => {
    for (const code of [71, 73, 75, 77]) {
      expect(getWeatherMeta(code).condition).toBe('snow');
      expect(getWeatherMeta(code).icon).toBe('snowflake');
    }
  });

  test('codes 80-82 → shower variants', () => {
    for (const code of [80, 81, 82]) {
      expect(getWeatherMeta(code).condition).toBe('showers');
      expect(getWeatherMeta(code).icon).toBe('cloud-rain-wind');
    }
  });

  test('codes 85-86 → snow showers', () => {
    for (const code of [85, 86]) {
      expect(getWeatherMeta(code).condition).toBe('snow');
    }
  });

  test('codes 95-99 → thunderstorm variants', () => {
    for (const code of [95, 96, 99]) {
      expect(getWeatherMeta(code).condition).toBe('thunderstorm');
      expect(getWeatherMeta(code).icon).toBe('cloud-lightning');
    }
  });

  test('unknown code returns fallback', () => {
    const meta = getWeatherMeta(999);
    expect(meta.condition).toBe('cloudy');
    expect(meta.labelKey).toBe('conditions.unknown');
    expect(meta.icon).toBe('cloud');
  });
});

// ─── getGradient ────────────────────────────────────────────────────────────

describe('getGradient', () => {
  test('returns a gradient string for known codes', () => {
    const gradient = getGradient(0);
    expect(gradient).toContain('linear-gradient');
  });

  test('each condition maps to a distinct gradient', () => {
    const codes: Record<WeatherCondition, number> = {
      clear: 0,
      'partly-cloudy': 1,
      cloudy: 3,
      fog: 45,
      drizzle: 51,
      rain: 61,
      snow: 71,
      showers: 80,
      thunderstorm: 95,
    };
    const gradients = new Set<string>();
    for (const code of Object.values(codes)) {
      gradients.add(getGradient(code));
    }
    expect(gradients.size).toBe(9);
  });

  test('unknown code uses fallback (cloudy) gradient', () => {
    const unknownGradient = getGradient(999);
    const cloudyGradient = getGradient(3);
    expect(unknownGradient).toBe(cloudyGradient);
  });
});

// ─── getConditionColor ──────────────────────────────────────────────────────

describe('getConditionColor', () => {
  test('clear sky returns yellow accent', () => {
    expect(getConditionColor(0)).toBe('#fbbf24');
  });

  test('each condition maps to a color', () => {
    const codes: Record<WeatherCondition, number> = {
      clear: 0,
      'partly-cloudy': 1,
      cloudy: 3,
      fog: 45,
      drizzle: 51,
      rain: 61,
      snow: 71,
      showers: 80,
      thunderstorm: 95,
    };
    for (const code of Object.values(codes)) {
      const color = getConditionColor(code);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('unknown code uses fallback (cloudy) color', () => {
    expect(getConditionColor(999)).toBe(getConditionColor(3));
  });
});

// ─── formatTemp ─────────────────────────────────────────────────────────────

describe('formatTemp', () => {
  test('celsius returns rounded value', () => {
    expect(formatTemp(22.7, 'celsius')).toBe('23');
  });

  test('celsius rounds down correctly', () => {
    expect(formatTemp(22.3, 'celsius')).toBe('22');
  });

  test('celsius handles negative values', () => {
    expect(formatTemp(-5.8, 'celsius')).toBe('-6');
  });

  test('celsius handles zero', () => {
    expect(formatTemp(0, 'celsius')).toBe('0');
  });

  test('fahrenheit converts and rounds', () => {
    // 0°C = 32°F
    expect(formatTemp(0, 'fahrenheit')).toBe('32');
  });

  test('fahrenheit converts 100°C', () => {
    // 100°C = 212°F
    expect(formatTemp(100, 'fahrenheit')).toBe('212');
  });

  test('fahrenheit converts negative', () => {
    // -40°C = -40°F
    expect(formatTemp(-40, 'fahrenheit')).toBe('-40');
  });

  test('fahrenheit rounds correctly', () => {
    // 22°C = 71.6°F → 72
    expect(formatTemp(22, 'fahrenheit')).toBe('72');
  });
});

// ─── tempUnit ───────────────────────────────────────────────────────────────

describe('tempUnit', () => {
  test('celsius returns °C', () => {
    expect(tempUnit('celsius')).toBe('\u00b0C');
  });

  test('fahrenheit returns °F', () => {
    expect(tempUnit('fahrenheit')).toBe('\u00b0F');
  });

  test('any other string defaults to celsius', () => {
    expect(tempUnit('kelvin')).toBe('\u00b0C');
  });
});

// ─── windDirectionLabel ─────────────────────────────────────────────────────

describe('windDirectionLabel', () => {
  test('0° → N', () => {
    expect(windDirectionLabel(0)).toBe('N');
  });

  test('45° → NE', () => {
    expect(windDirectionLabel(45)).toBe('NE');
  });

  test('90° → E', () => {
    expect(windDirectionLabel(90)).toBe('E');
  });

  test('135° → SE', () => {
    expect(windDirectionLabel(135)).toBe('SE');
  });

  test('180° → S', () => {
    expect(windDirectionLabel(180)).toBe('S');
  });

  test('225° → SW', () => {
    expect(windDirectionLabel(225)).toBe('SW');
  });

  test('270° → W', () => {
    expect(windDirectionLabel(270)).toBe('W');
  });

  test('315° → NW', () => {
    expect(windDirectionLabel(315)).toBe('NW');
  });

  test('360° wraps to N', () => {
    expect(windDirectionLabel(360)).toBe('N');
  });

  test('22° rounds to NE', () => {
    expect(windDirectionLabel(22)).toBe('N');
  });

  test('23° rounds to NE', () => {
    expect(windDirectionLabel(23)).toBe('NE');
  });
});

// ─── formatTempWithUnit ─────────────────────────────────────────────────────

describe('formatTempWithUnit', () => {
  test('celsius combines value and unit', () => {
    expect(formatTempWithUnit(22.7, 'celsius')).toBe('23\u00b0C');
  });

  test('fahrenheit combines converted value and unit', () => {
    expect(formatTempWithUnit(0, 'fahrenheit')).toBe('32\u00b0F');
  });

  test('negative celsius', () => {
    expect(formatTempWithUnit(-5.8, 'celsius')).toBe('-6\u00b0C');
  });
});

// ─── getWeatherVisuals ──────────────────────────────────────────────────────

describe('getWeatherVisuals', () => {
  test('returns meta, color, and gradient for known code', () => {
    const v = getWeatherVisuals(0);
    expect(v.meta.condition).toBe('clear');
    expect(v.color).toBe('#fbbf24');
    expect(v.gradient).toContain('linear-gradient');
  });

  test('matches individual helper results', () => {
    const v = getWeatherVisuals(61);
    expect(v.meta).toEqual(getWeatherMeta(61));
    expect(v.color).toBe(getConditionColor(61));
    expect(v.gradient).toBe(getGradient(61));
  });

  test('unknown code uses fallback', () => {
    const v = getWeatherVisuals(999);
    expect(v.meta.condition).toBe('cloudy');
    expect(v.color).toBe(getConditionColor(3));
    expect(v.gradient).toBe(getGradient(3));
  });
});

// ─── dayName ────────────────────────────────────────────────────────────────

describe('dayName', () => {
  const { t } = createMockTranslation('plugin:weather');

  test('today returns I18nRef for days.today', () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const result = dayName(dateStr, t);
    expect(result).toEqual(t('days.today'));
  });

  test('tomorrow returns I18nRef for days.tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    const result = dayName(dateStr, t);
    expect(result).toEqual(t('days.tomorrow'));
  });

  test('other dates return I18nRef for weekday key', () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const dateStr = nextWeek.toISOString().slice(0, 10);
    const result = dayName(dateStr, t);
    // Should be an I18nRef with a days.xxx key
    expect(result).toHaveProperty('__i18n', true);
    expect(result).toHaveProperty('ns', 'plugin:weather');
    expect((result as { key: string }).key).toMatch(/^days\.(mon|tue|wed|thu|fri|sat|sun)$/);
  });

  test('all weekdays map to correct keys', () => {
    const expected = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    // Use a date far enough in the future to avoid today/tomorrow
    const base = new Date();
    base.setDate(base.getDate() + 10);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const result = dayName(dateStr, t);
      const dayIdx = d.getDay();
      expect((result as { key: string }).key).toBe(`days.${expected[dayIdx]}`);
    }
  });
});
