/**
 * Tests for reactive block API
 */

import { describe, expect, mock, test } from 'bun:test';
import { CleanupRegistry, isSource } from '@brika/flow';
import { z } from 'zod';
import {
  createEmitter,
  createFlowFromInput,
  input,
  output,
  zodToJsonSchema,
  zodToTypeName,
} from '../blocks/reactive';
import { generic, passthrough } from '../blocks/schema-types';

// ─────────────────────────────────────────────────────────────────────────────
// input / output
// ─────────────────────────────────────────────────────────────────────────────

describe('input', () => {
  test('creates InputDef with Zod schema', () => {
    const def = input(z.string(), { name: 'Test Input' });
    expect(def.__type).toBe('input');
    expect(def.meta.name).toBe('Test Input');
  });

  test('creates InputDef with GenericRef', () => {
    const def = input(generic(), { name: 'Generic Input' });
    expect(def.__type).toBe('input');
    expect(def.schema.__type).toBe('generic');
  });

  test('preserves description in meta', () => {
    const def = input(z.number(), { name: 'Count', description: 'A count value' });
    expect(def.meta.description).toBe('A count value');
  });
});

describe('output', () => {
  test('creates OutputDef with Zod schema', () => {
    const def = output(z.number(), { name: 'Test Output' });
    expect(def.__type).toBe('output');
    expect(def.meta.name).toBe('Test Output');
  });

  test('creates OutputDef with PassthroughRef', () => {
    const def = output(passthrough('in'), { name: 'Passthrough Output' });
    expect(def.__type).toBe('output');
    expect(def.schema.__type).toBe('passthrough');
  });

  test('creates OutputDef with GenericRef', () => {
    const def = output(generic('T'), { name: 'Generic Output' });
    expect(def.__type).toBe('output');
    expect(def.schema.__type).toBe('generic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createEmitter
// ─────────────────────────────────────────────────────────────────────────────

describe('createEmitter', () => {
  test('creates emitter that calls emit callback', () => {
    const emitFn = mock();
    const emitter = createEmitter<string>('out', z.string(), emitFn);

    emitter.emit('hello');

    expect(emitFn).toHaveBeenCalledWith('out', 'hello');
  });

  test('emitAll calls emit for each value', () => {
    const emitFn = mock();
    const emitter = createEmitter<number>('out', z.number(), emitFn);

    emitter.emitAll([1, 2, 3]);

    expect(emitFn).toHaveBeenCalledTimes(3);
    expect(emitFn).toHaveBeenCalledWith('out', 1);
    expect(emitFn).toHaveBeenCalledWith('out', 2);
    expect(emitFn).toHaveBeenCalledWith('out', 3);
  });

  test('validates output in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const warnSpy = mock();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      const emitFn = mock();
      const emitter = createEmitter<string>('out', z.string(), emitFn);

      // @ts-expect-error - intentionally passing wrong type
      emitter.emit(123);

      // Should still emit but warn
      expect(emitFn).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
      console.warn = originalWarn;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createFlowFromInput
// ─────────────────────────────────────────────────────────────────────────────

describe('createFlowFromInput', () => {
  test('creates flow from static value', async () => {
    const cleanup = new CleanupRegistry();
    const setTimeoutFn = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    };

    const flow = createFlowFromInput(42, setTimeoutFn, cleanup);
    const values: number[] = [];

    flow.on((v) => values.push(v));

    // Wait for async push
    await new Promise((r) => setTimeout(r, 10));

    expect(values).toEqual([42]);
    cleanup.cleanup();
  });

  test('creates flow from factory function', async () => {
    const cleanup = new CleanupRegistry();
    const setTimeoutFn = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    };

    const values: number[] = [];

    // Factory that pushes values after a short delay
    const factory = (push: (v: number) => void) => {
      setTimeout(() => {
        push(1);
        push(2);
      }, 5);
      return () => undefined;
    };

    const flow = createFlowFromInput(factory, setTimeoutFn, cleanup);
    flow.on((v) => values.push(v));

    // Wait for async push
    await new Promise((r) => setTimeout(r, 20));

    expect(values).toEqual([1, 2]);
    cleanup.cleanup();
  });

  test('creates flow from source object', async () => {
    const cleanup = new CleanupRegistry();
    const setTimeoutFn = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    };

    const values: string[] = [];

    // Create source that pushes values after a short delay
    const source = {
      __source: true as const,
      start: (push: (v: string) => void) => {
        setTimeout(() => {
          push('a');
          push('b');
        }, 5);
        return () => undefined;
      },
    };

    const flow = createFlowFromInput(source, setTimeoutFn, cleanup);
    flow.on((v) => values.push(v));

    // Wait for async push
    await new Promise((r) => setTimeout(r, 20));

    expect(values).toEqual(['a', 'b']);
    cleanup.cleanup();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zodToJsonSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('zodToJsonSchema', () => {
  test('converts string schema', () => {
    const schema = zodToJsonSchema(z.string());
    expect(schema.type).toBe('string');
  });

  test('converts number schema', () => {
    const schema = zodToJsonSchema(z.number());
    expect(schema.type).toBe('number');
  });

  test('converts boolean schema', () => {
    const schema = zodToJsonSchema(z.boolean());
    expect(schema.type).toBe('boolean');
  });

  test('converts object schema', () => {
    const schema = zodToJsonSchema(z.object({ name: z.string(), age: z.number() }));
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
  });

  test('converts array schema', () => {
    const schema = zodToJsonSchema(z.array(z.string()));
    expect(schema.type).toBe('array');
  });

  test('converts enum schema', () => {
    const schema = zodToJsonSchema(z.enum(['a', 'b', 'c']));
    expect(schema.enum).toEqual(['a', 'b', 'c']);
  });

  test('converts union schema', () => {
    const schema = zodToJsonSchema(z.union([z.string(), z.number()]));
    expect(schema.anyOf).toBeDefined();
  });

  test('handles optional schema', () => {
    const schema = zodToJsonSchema(z.string().optional());
    // Optional in JSON Schema is typically represented differently
    expect(schema).toBeDefined();
  });

  test('handles nullable schema', () => {
    const schema = zodToJsonSchema(z.string().nullable());
    expect(schema).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zodToTypeName
// ─────────────────────────────────────────────────────────────────────────────

describe('zodToTypeName', () => {
  test('converts string schema', () => {
    expect(zodToTypeName(z.string())).toBe('string');
  });

  test('converts number schema', () => {
    expect(zodToTypeName(z.number())).toBe('number');
  });

  test('converts boolean schema', () => {
    expect(zodToTypeName(z.boolean())).toBe('boolean');
  });

  test('converts null schema', () => {
    expect(zodToTypeName(z.null())).toBe('null');
  });

  test('converts integer to number', () => {
    expect(zodToTypeName(z.number().int())).toBe('number');
  });

  test('converts array schema', () => {
    expect(zodToTypeName(z.array(z.string()))).toBe('string[]');
  });

  test('converts object schema', () => {
    const result = zodToTypeName(z.object({ name: z.string(), age: z.number() }));
    expect(result).toContain('name: string');
    expect(result).toContain('age: number');
  });

  test('converts empty object schema', () => {
    expect(zodToTypeName(z.object({}))).toBe('{}');
  });

  test('converts union schema', () => {
    const result = zodToTypeName(z.union([z.string(), z.number()]));
    expect(result).toContain('string');
    expect(result).toContain('number');
    expect(result).toContain('|');
  });

  test('converts enum schema', () => {
    const result = zodToTypeName(z.enum(['a', 'b', 'c']));
    // Enum might be converted to string or union of literals
    expect(typeof result).toBe('string');
  });

  test('handles unknown type gracefully', () => {
    // Create a schema that might produce an unknown type
    const result = zodToTypeName(z.any());
    expect(typeof result).toBe('string');
  });

  test('handles schema conversion error gracefully', () => {
    // Create a mock schema that throws during conversion
    const mockSchema = {
      _def: { typeName: 'invalid' },
    } as unknown as z.ZodType;

    // Should return 'unknown' on error
    const result = zodToTypeName(mockSchema);
    expect(result).toBe('unknown');
  });
});
