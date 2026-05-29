import { describe, expect, test } from 'bun:test';
import { interpolate } from './interpolate';

describe('interpolate — basics', () => {
  test('returns the template unchanged when there are no placeholders', () => {
    expect(interpolate('Hello world', {})).toBe('Hello world');
  });

  test('substitutes simple {{var}} placeholders', () => {
    expect(interpolate('Hello {{name}}', { name: 'Max' })).toBe('Hello Max');
  });

  test('substitutes multiple placeholders', () => {
    expect(interpolate('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  test('renders missing values as empty string', () => {
    expect(interpolate('Hi {{name}}', {})).toBe('Hi ');
    expect(interpolate('Hi {{name}}', { name: null })).toBe('Hi ');
    expect(interpolate('Hi {{name}}', { name: undefined })).toBe('Hi ');
  });

  test('coerces non-string values to string', () => {
    expect(interpolate('{{n}} items', { n: 5 })).toBe('5 items');
    expect(interpolate('{{ok}}', { ok: true })).toBe('true');
  });
});

describe('interpolate — built-in formatters', () => {
  test('number formatter respects locale grouping', () => {
    expect(interpolate('{{n, number}}', { n: 1234567 }, { locale: 'en-US' })).toBe('1,234,567');
    expect(interpolate('{{n, number}}', { n: 1234567 }, { locale: 'fr-FR' })).toContain('234');
  });

  test('currency formatter uses option as currency code', () => {
    const result = interpolate('{{p, currency, USD}}', { p: 9.5 }, { locale: 'en-US' });
    expect(result).toContain('9.50');
    expect(result).toContain('$');
  });

  test('percent formatter scales to percent', () => {
    expect(interpolate('{{p, percent}}', { p: 0.42 }, { locale: 'en-US' })).toBe('42%');
  });

  test('date formatter accepts Date and number inputs', () => {
    const d = new Date('2026-05-21T12:00:00Z');
    expect(interpolate('{{d, date}}', { d }, { locale: 'en-US' })).toMatch(/2026/);
    expect(interpolate('{{d, date}}', { d: d.getTime() }, { locale: 'en-US' })).toMatch(/2026/);
  });

  test('uppercase / lowercase formatters', () => {
    expect(interpolate('{{s, uppercase}}', { s: 'hello' })).toBe('HELLO');
    expect(interpolate('{{s, lowercase}}', { s: 'HELLO' })).toBe('hello');
  });

  test('list formatter joins arrays', () => {
    expect(interpolate('{{xs, list}}', { xs: ['a', 'b', 'c'] }, { locale: 'en-US' })).toBe(
      'a, b, and c'
    );
  });

  test('unknown formatter falls back to String(value)', () => {
    expect(interpolate('{{x, made_up}}', { x: 7 })).toBe('7');
  });

  test('custom formatter overrides built-ins', () => {
    expect(
      interpolate(
        '{{n, number}}',
        { n: 5 },
        {
          formatters: {
            number: (v) => `[${v}]`,
          },
        }
      )
    ).toBe('[5]');
  });
});

describe('interpolate — robustness', () => {
  test('ignores nested braces (no recursion)', () => {
    expect(interpolate('{{a}}', { a: '{{b}}' })).toBe('{{b}}');
  });

  test('ignores empty placeholder', () => {
    expect(interpolate('{{}}', {})).toBe('{{}}');
  });
});
