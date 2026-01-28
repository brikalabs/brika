import { describe, expect, test } from 'bun:test';
import { NotFound } from '@brika/router';
import { getOrThrow } from '@/runtime/http/utils/resource-helpers';

describe('getOrThrow', () => {
  test('should return value when not null', () => {
    const value = { id: 1, name: 'test' };

    const result = getOrThrow(value, 'Not found');

    expect(result).toBe(value);
  });

  test('should return value when truthy', () => {
    const value = 'hello';

    const result = getOrThrow(value, 'Not found');

    expect(result).toBe(value);
  });

  test('should return value when 0', () => {
    const result = getOrThrow(0, 'Not found');

    expect(result).toBe(0);
  });

  test('should return value when false', () => {
    const result = getOrThrow(false, 'Not found');

    expect(result).toBeFalse();
  });

  test('should return value when empty string', () => {
    const result = getOrThrow('', 'Not found');

    expect(result).toBe('');
  });

  test('should throw NotFound when null', () => {
    expect(() => getOrThrow(null, 'Resource not found')).toThrow(NotFound);
  });

  test('should throw NotFound when undefined', () => {
    expect(() => getOrThrow(undefined, 'Resource not found')).toThrow(NotFound);
  });

  test('should include message in error', () => {
    try {
      getOrThrow(null, 'Plugin not found');
      expect(true).toBeFalse(); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(NotFound);
      expect((error as NotFound).message).toBe('Plugin not found');
    }
  });

  test('should preserve type information', () => {
    interface User {
      id: number;
      name: string;
    }

    const user: User | null = { id: 1, name: 'Test' };
    const result: User = getOrThrow(user, 'User not found');

    expect(result.id).toBe(1);
    expect(result.name).toBe('Test');
  });
});
