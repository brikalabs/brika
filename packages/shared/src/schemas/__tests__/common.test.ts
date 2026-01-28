/**
 * Tests for common Zod schemas
 */
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { nonEmptyRecord, PositionSchema } from '../common';

describe('PositionSchema', () => {
  it('should accept valid position with integers', () => {
    const result = PositionSchema.parse({ x: 10, y: 20 });
    expect(result).toEqual({ x: 10, y: 20 });
  });

  it('should round float coordinates to integers', () => {
    const result = PositionSchema.parse({ x: 10.7, y: 20.3 });
    expect(result).toEqual({ x: 11, y: 20 });
  });

  it('should round negative coordinates', () => {
    const result = PositionSchema.parse({ x: -5.4, y: -8.6 });
    expect(result).toEqual({ x: -5, y: -9 });
  });

  it('should handle zero coordinates', () => {
    const result = PositionSchema.parse({ x: 0, y: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('should handle very large numbers', () => {
    const result = PositionSchema.parse({ x: 999999.9, y: -999999.1 });
    expect(result).toEqual({ x: 1000000, y: -999999 });
  });

  it('should reject missing x coordinate', () => {
    expect(() => PositionSchema.parse({ y: 20 })).toThrow();
  });

  it('should reject missing y coordinate', () => {
    expect(() => PositionSchema.parse({ x: 10 })).toThrow();
  });

  it('should reject non-numeric values', () => {
    expect(() => PositionSchema.parse({ x: 'ten', y: 20 })).toThrow();
    expect(() => PositionSchema.parse({ x: 10, y: 'twenty' })).toThrow();
  });

  it('should reject null values', () => {
    expect(() => PositionSchema.parse({ x: null, y: 20 })).toThrow();
    expect(() => PositionSchema.parse({ x: 10, y: null })).toThrow();
  });

  it('should reject NaN', () => {
    expect(() => PositionSchema.parse({ x: NaN, y: 20 })).toThrow();
    expect(() => PositionSchema.parse({ x: 10, y: NaN })).toThrow();
  });
});

describe('nonEmptyRecord', () => {
  const TestSchema = nonEmptyRecord(z.record(z.string(), z.number()));

  it('should accept non-empty record', () => {
    const result = TestSchema.parse({ foo: 1, bar: 2 });
    expect(result).toEqual({ foo: 1, bar: 2 });
  });

  it('should transform empty record to undefined', () => {
    const result = TestSchema.parse({});
    expect(result).toBeUndefined();
  });

  it('should transform undefined to undefined', () => {
    const result = TestSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  it('should accept single-key record', () => {
    const result = TestSchema.parse({ only: 42 });
    expect(result).toEqual({ only: 42 });
  });

  it('should work with string values', () => {
    const StringSchema = nonEmptyRecord(z.record(z.string(), z.string()));
    const result = StringSchema.parse({ name: 'test', value: 'hello' });
    expect(result).toEqual({ name: 'test', value: 'hello' });
  });

  it('should work with nested objects', () => {
    const NestedSchema = nonEmptyRecord(
      z.record(
        z.string(),
        z.object({
          id: z.number(),
          name: z.string(),
        })
      )
    );
    const result = NestedSchema.parse({
      user1: { id: 1, name: 'Alice' },
      user2: { id: 2, name: 'Bob' },
    });
    expect(result).toEqual({
      user1: { id: 1, name: 'Alice' },
      user2: { id: 2, name: 'Bob' },
    });
  });

  it('should validate inner schema for non-empty records', () => {
    const StrictSchema = nonEmptyRecord(z.record(z.string(), z.number().positive()));
    expect(() => StrictSchema.parse({ foo: -1 })).toThrow();
  });

  it('should handle records with many keys', () => {
    const data: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      data[`key${i}`] = i;
    }
    const result = TestSchema.parse(data);
    expect(result).toEqual(data);
    expect(Object.keys(result ?? {}).length).toBe(100);
  });

  it('should work in optional chains', () => {
    const ObjectSchema = z.object({
      config: nonEmptyRecord(z.record(z.string(), z.unknown())),
      name: z.string(),
    });

    const withConfig = ObjectSchema.parse({
      config: { setting: 'value' },
      name: 'test',
    });
    expect(withConfig.config).toEqual({ setting: 'value' });

    const withoutConfig = ObjectSchema.parse({
      config: {},
      name: 'test',
    });
    expect(withoutConfig.config).toBeUndefined();
  });
});

describe('PositionSchema with nonEmptyRecord integration', () => {
  it('should work together in complex schemas', () => {
    const BlockSchema = z.object({
      id: z.string(),
      type: z.string(),
      position: PositionSchema.optional(),
      config: nonEmptyRecord(z.record(z.string(), z.unknown())),
    });

    // With position and config
    const result1 = BlockSchema.parse({
      id: 'block-1',
      type: 'timer',
      position: { x: 10.5, y: 20.8 },
      config: { interval: 1000 },
    });
    expect(result1.position).toEqual({ x: 11, y: 21 });
    expect(result1.config).toEqual({ interval: 1000 });

    // Without optional fields
    const result2 = BlockSchema.parse({
      id: 'block-2',
      type: 'trigger',
      config: {},
    });
    expect(result2.position).toBeUndefined();
    expect(result2.config).toBeUndefined();
  });
});
