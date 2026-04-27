import { describe, expect, test } from 'bun:test';
import { cn } from '../cn';

describe('cn', () => {
  test('joins string classes', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  test('drops falsy values (null, undefined, false, "")', () => {
    expect(cn('a', null, undefined, false, '', 'b')).toBe('a b');
  });

  test('handles conditional classes via the clsx object form', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  test('flattens arrays', () => {
    expect(cn(['a', ['b', 'c']], 'd')).toBe('a b c d');
  });

  test('resolves Tailwind conflicts — last wins', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  test('preserves arbitrary-value Tailwind utilities', () => {
    expect(cn('text-[10px]', 'font-medium')).toBe('text-[10px] font-medium');
  });

  test('returns an empty string when nothing is passed', () => {
    expect(cn()).toBe('');
  });
});
