import { describe, expect, test } from 'bun:test';
import { BytesSchema, DurationSchema, formatBytes, formatDuration } from './units';

describe('BytesSchema', () => {
  test('parses readable strings to bytes', () => {
    expect(BytesSchema.parse('512mb')).toBe(512 * 1024 * 1024);
    expect(BytesSchema.parse('2gb')).toBe(2 * 1024 ** 3);
    expect(BytesSchema.parse('256mib')).toBe(256 * 1024 * 1024);
    expect(BytesSchema.parse('1 kb')).toBe(1024);
  });

  test('passes raw integers through, including 0 (disabled sentinel)', () => {
    expect(BytesSchema.parse(536870912)).toBe(536870912);
    expect(BytesSchema.parse(0)).toBe(0);
  });

  test('rejects malformed values', () => {
    expect(() => BytesSchema.parse('512 potatoes')).toThrow();
    expect(() => BytesSchema.parse(-1)).toThrow();
  });
});

describe('DurationSchema', () => {
  test('parses readable strings to milliseconds', () => {
    expect(DurationSchema.parse('5s')).toBe(5000);
    expect(DurationSchema.parse('15s')).toBe(15_000);
    expect(DurationSchema.parse('1h')).toBe(60 * 60 * 1000);
    expect(DurationSchema.parse('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(DurationSchema.parse('250ms')).toBe(250);
  });

  test('treats a bare number as milliseconds, and allows 0', () => {
    expect(DurationSchema.parse('5000')).toBe(5000);
    expect(DurationSchema.parse(5000)).toBe(5000);
    expect(DurationSchema.parse(0)).toBe(0);
  });

  test('rejects malformed values', () => {
    expect(() => DurationSchema.parse('soon')).toThrow();
    expect(() => DurationSchema.parse('5y')).toThrow();
    expect(() => DurationSchema.parse(-1)).toThrow();
  });
});

describe('formatters', () => {
  test('formatBytes picks the largest evenly-dividing unit', () => {
    expect(formatBytes(512 * 1024 * 1024)).toBe('512mb');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2gb');
    expect(formatBytes(0)).toBe('0');
    expect(formatBytes(1500)).toBe('1500'); // not a round unit
  });

  test('formatDuration picks the largest evenly-dividing unit', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(60 * 60 * 1000)).toBe('1h');
    expect(formatDuration(7 * 24 * 60 * 60 * 1000)).toBe('7d');
    expect(formatDuration(0)).toBe('0');
    expect(formatDuration(250)).toBe('250ms');
  });

  test('round-trips readable values', () => {
    for (const v of ['512mb', '2gb', '256mib']) {
      expect(formatBytes(BytesSchema.parse(v))).toBe(v === '256mib' ? '256mb' : v);
    }
    for (const v of ['5s', '15s', '1h', '7d', '90d', '250ms']) {
      expect(formatDuration(DurationSchema.parse(v))).toBe(v);
    }
  });
});
