import { describe, expect, test } from 'bun:test';
import { selectPlural, selectPluralSuffix } from '../plural';

describe('selectPlural', () => {
  test('English: 1 → one, 0/2+ → other', () => {
    expect(selectPlural(1, 'en')).toBe('one');
    expect(selectPlural(0, 'en')).toBe('other');
    expect(selectPlural(2, 'en')).toBe('other');
    expect(selectPlural(100, 'en')).toBe('other');
  });

  test('French: 0/1 → one, 2+ → other', () => {
    expect(selectPlural(0, 'fr')).toBe('one');
    expect(selectPlural(1, 'fr')).toBe('one');
    expect(selectPlural(2, 'fr')).toBe('other');
  });

  test('falls back to English rules for unknown locales', () => {
    expect(selectPlural(1, 'xx-FAKE')).toBe('one');
    expect(selectPlural(2, 'xx-FAKE')).toBe('other');
  });
});

describe('selectPluralSuffix', () => {
  test('returns the exact category when available', () => {
    expect(selectPluralSuffix(1, 'en', new Set(['one', 'other']))).toBe('_one');
    expect(selectPluralSuffix(2, 'en', new Set(['one', 'other']))).toBe('_other');
  });

  test('falls back to _other when the exact category is missing', () => {
    expect(selectPluralSuffix(0, 'en', new Set(['other']))).toBe('_other');
  });

  test('returns empty string when no available category matches', () => {
    expect(selectPluralSuffix(1, 'en', new Set())).toBe('');
  });
});
