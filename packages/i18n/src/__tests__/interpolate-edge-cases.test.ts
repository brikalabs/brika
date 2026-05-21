import { describe, expect, test } from 'bun:test';
import { defaultFormatters, interpolate } from '../interpolate';

describe('interpolate — value coercion', () => {
  test('bigint values are stringified', () => {
    expect(interpolate('{{n}}', { n: 9007199254740993n })).toBe('9007199254740993');
  });

  test('plain objects are JSON-stringified instead of "[object Object]"', () => {
    expect(interpolate('{{x}}', { x: { foo: 1 } })).toBe('{"foo":1}');
  });

  test('arrays without a list formatter are JSON-stringified', () => {
    expect(interpolate('{{xs}}', { xs: [1, 2, 3] })).toBe('[1,2,3]');
  });

  test('boolean false coerces to "false" (not empty)', () => {
    expect(interpolate('{{ok}}', { ok: false })).toBe('false');
  });
});

describe('interpolate — number formatter edge cases', () => {
  test('falls back to String(value) when value is not a number', () => {
    expect(interpolate('{{n, number}}', { n: 'abc' })).toBe('abc');
  });

  test('applies a number option to the formatter', () => {
    expect(
      interpolate('{{n, number, minimumFractionDigits:2}}', { n: 1 }, { locale: 'en-US' })
    ).toBe('1.00');
  });

  test('drops an unknown number option silently', () => {
    expect(interpolate('{{n, number, banana:2}}', { n: 1234 }, { locale: 'en-US' })).toBe('1,234');
  });
});

describe('interpolate — currency formatter', () => {
  test('defaults to USD when no currency code given', () => {
    const result = interpolate('{{p, currency}}', { p: 10 }, { locale: 'en-US' });
    expect(result).toContain('10');
    expect(result).toContain('$');
  });

  test('falls back to String for non-numeric input', () => {
    expect(interpolate('{{p, currency, USD}}', { p: 'not-a-number' })).toBe('not-a-number');
  });
});

describe('interpolate — percent formatter', () => {
  test('falls back to String for non-numeric input', () => {
    expect(interpolate('{{p, percent}}', { p: 'oops' })).toBe('oops');
  });
});

describe('interpolate — date formatter', () => {
  test('accepts ISO string input', () => {
    expect(interpolate('{{d, date}}', { d: '2026-05-21' }, { locale: 'en-US' })).toMatch(/2026/);
  });

  test('respects valid dateStyle option (full)', () => {
    const d = new Date('2026-05-21T12:00:00Z');
    const result = interpolate('{{d, date, full}}', { d }, { locale: 'en-US' });
    expect(result).toMatch(/2026/);
    expect(result.length).toBeGreaterThan(10);
  });

  test('falls back to medium when option is invalid', () => {
    const d = new Date('2026-05-21T12:00:00Z');
    expect(interpolate('{{d, date, weirdo}}', { d }, { locale: 'en-US' })).toMatch(/2026/);
  });

  test('falls back to String when value is not a date-shaped input', () => {
    expect(interpolate('{{d, date}}', { d: true })).toBe('true');
  });

  test('treats an invalid Date as a fall-through', () => {
    const bad = new Date('not-a-date');
    expect(interpolate('{{d, date}}', { d: bad })).toBe(String(bad));
  });

  test('treats an out-of-range numeric timestamp as a fall-through', () => {
    expect(interpolate('{{d, date}}', { d: Number.NaN })).toBe('NaN');
  });
});

describe('interpolate — time formatter', () => {
  test('accepts a numeric timestamp', () => {
    const ts = Date.parse('2026-05-21T08:30:00Z');
    const result = interpolate('{{t, time}}', { t: ts }, { locale: 'en-US' });
    expect(result).toMatch(/AM|PM|\d/);
  });

  test('falls back to short style for invalid option', () => {
    const ts = Date.parse('2026-05-21T08:30:00Z');
    const result = interpolate('{{t, time, weirdo}}', { t: ts }, { locale: 'en-US' });
    expect(result).toMatch(/AM|PM|\d/);
  });

  test('falls back to String for non-date input', () => {
    expect(interpolate('{{t, time}}', { t: {} })).toBe('[object Object]');
  });
});

describe('interpolate — datetime formatter', () => {
  test('formats a Date with default style', () => {
    const d = new Date('2026-05-21T08:30:00Z');
    const result = interpolate('{{d, datetime}}', { d }, { locale: 'en-US' });
    expect(result).toMatch(/2026/);
  });

  test('accepts a valid style', () => {
    const d = new Date('2026-05-21T08:30:00Z');
    const result = interpolate('{{d, datetime, long}}', { d }, { locale: 'en-US' });
    expect(result).toMatch(/2026/);
  });

  test('falls back to String for non-date input', () => {
    expect(interpolate('{{d, datetime}}', { d: null })).toBe('');
  });
});

describe('interpolate — relative formatter', () => {
  test('formats integer with default unit (second)', () => {
    const result = interpolate('{{n, relative}}', { n: -10 }, { locale: 'en-US' });
    expect(result).toMatch(/second|sec/);
  });

  test('respects valid unit option', () => {
    const result = interpolate('{{n, relative, day}}', { n: -3 }, { locale: 'en-US' });
    expect(result.toLowerCase()).toMatch(/day|yesterday/);
  });

  test('falls back to second on unknown unit', () => {
    const result = interpolate('{{n, relative, fortnight}}', { n: -1 }, { locale: 'en-US' });
    expect(result).toMatch(/second|sec|ago/);
  });

  test('falls back to String for non-numeric input', () => {
    expect(interpolate('{{n, relative}}', { n: 'soon' })).toBe('soon');
  });
});

describe('interpolate — list formatter', () => {
  test('non-array falls back to String', () => {
    expect(interpolate('{{xs, list}}', { xs: 'plain' })).toBe('plain');
  });

  test('handles arrays containing non-printable values via JSON', () => {
    const result = interpolate('{{xs, list}}', { xs: ['a', { z: 1 }] }, { locale: 'en-US' });
    expect(result).toContain('a');
    expect(result).toContain('"z":1');
  });

  test('empty array yields empty string', () => {
    expect(interpolate('{{xs, list}}', { xs: [] }, { locale: 'en-US' })).toBe('');
  });
});

describe('interpolate — case formatters', () => {
  test('uppercase respects locale (Turkish dotted i)', () => {
    expect(interpolate('{{s, uppercase}}', { s: 'istanbul' }, { locale: 'tr-TR' })).toContain('İ');
  });

  test('lowercase respects locale', () => {
    expect(interpolate('{{s, lowercase}}', { s: 'HELLO' }, { locale: 'en-US' })).toBe('hello');
  });
});

describe('interpolate — placeholder edge cases', () => {
  test('drops a placeholder with only commas (empty name)', () => {
    expect(interpolate('a {{, foo}} b', { foo: 'x' })).toBe('a  b');
  });

  test('placeholder with whitespace-only name is dropped', () => {
    expect(interpolate('a {{   }} b', {})).toBe('a  b');
  });

  test('renders both branches when value is null vs zero', () => {
    expect(interpolate('{{n}}', { n: 0 })).toBe('0');
    expect(interpolate('{{n}}', { n: null })).toBe('');
  });

  test('custom formatters merge with defaults instead of replacing them', () => {
    const result = interpolate(
      '{{a, upper}} {{b, uppercase}}',
      { a: 'hi', b: 'yo' },
      {
        formatters: {
          upper: (v) => `<${String(v)}>`,
        },
      }
    );
    expect(result).toBe('<hi> YO');
  });
});

describe('defaultFormatters export', () => {
  test('exposes all built-in formatter names', () => {
    expect(Object.keys(defaultFormatters).sort()).toEqual(
      [
        'currency',
        'date',
        'datetime',
        'list',
        'lowercase',
        'number',
        'percent',
        'relative',
        'time',
        'uppercase',
      ].sort()
    );
  });
});
