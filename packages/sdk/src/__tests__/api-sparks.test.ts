/**
 * Tests for SDK sparks API
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';

const mockEmitSpark = mock(() => {});
const mockRegisterSpark = mock(() => {});
const mockSubscribeSpark = mock(() => () => {});

mock.module('../context', () => ({
  getContext: () => ({
    emitSpark: mockEmitSpark,
    registerSpark: mockRegisterSpark,
    subscribeSpark: mockSubscribeSpark,
  }),
}));

const { defineSpark, subscribeSpark } = await import('../api/sparks');

describe('defineSpark', () => {
  beforeEach(() => {
    mockEmitSpark.mockClear();
    mockRegisterSpark.mockClear();
  });

  test('returns a CompiledSpark with correct id and schema', () => {
    const schema = z.object({ value: z.number() });
    const spark = defineSpark({ id: 'test-spark', schema });

    expect(spark.id).toBe('test-spark');
    expect(spark.schema).toBe(schema);
    expect(typeof spark.emit).toBe('function');
  });

  test('emit calls context.emitSpark with correct arguments', () => {
    const schema = z.object({ value: z.number() });
    const spark = defineSpark({ id: 'counter', schema });

    spark.emit({ value: 42 });
    expect(mockEmitSpark).toHaveBeenCalledWith('counter', { value: 42 });
  });

  test('registers spark schema with hub', () => {
    const schema = z.object({ name: z.string() });
    defineSpark({ id: 'named', schema });

    expect(mockRegisterSpark).toHaveBeenCalledTimes(1);
    const call = mockRegisterSpark.mock.calls[0] as unknown as [{ id: string; schema: unknown }];
    expect(call[0].id).toBe('named');
    expect(call[0].schema).toBeDefined();
  });

  test('handles registration failure gracefully', () => {
    mockRegisterSpark.mockImplementationOnce(() => {
      throw new Error('No context');
    });

    const schema = z.object({ v: z.string() });
    const spark = defineSpark({ id: 'fallback', schema });
    expect(spark.id).toBe('fallback');
  });
});

describe('subscribeSpark', () => {
  beforeEach(() => {
    mockSubscribeSpark.mockClear();
  });

  test('returns a Source with __source flag', () => {
    const source = subscribeSpark('timer:tick');
    expect(source.__source).toBe(true);
    expect(typeof source.start).toBe('function');
  });

  test('start calls context.subscribeSpark with emit callback', () => {
    const source = subscribeSpark('timer:tick');
    const emit = mock(() => {});
    source.start(emit);
    expect(mockSubscribeSpark).toHaveBeenCalledWith('timer:tick', emit);
  });
});
