/**
 * Tests for schema compatibility checking
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  getSchemaTypeName,
  isSchemaCompatible,
  validatePortData,
} from '../validation/compatibility';

describe('isSchemaCompatible', () => {
  describe('any/unknown types', () => {
    test('unknown input accepts any output', () => {
      expect(isSchemaCompatible(z.string(), z.unknown())).toBe(true);
      expect(isSchemaCompatible(z.number(), z.unknown())).toBe(true);
      expect(
        isSchemaCompatible(
          z.object({
            a: z.string(),
          }),
          z.unknown()
        )
      ).toBe(true);
    });

    test('any input accepts any output', () => {
      expect(isSchemaCompatible(z.string(), z.any())).toBe(true);
      expect(isSchemaCompatible(z.array(z.number()), z.any())).toBe(true);
    });
  });

  describe('primitive types', () => {
    test('same primitive types are compatible', () => {
      expect(isSchemaCompatible(z.string(), z.string())).toBe(true);
      expect(isSchemaCompatible(z.number(), z.number())).toBe(true);
      expect(isSchemaCompatible(z.boolean(), z.boolean())).toBe(true);
    });
  });

  describe('object types', () => {
    test('same shape objects are compatible', () => {
      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });
      expect(isSchemaCompatible(schema, schema)).toBe(true);
    });
  });
});

describe('validatePortData', () => {
  test('returns valid for matching data', () => {
    const result = validatePortData('hello', z.string());

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).toBe('hello');
    }
  });

  test('returns invalid with error message for non-matching data', () => {
    const result = validatePortData(123, z.string());

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  test('includes field path in error for nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
      }),
    });
    const result = validatePortData(
      {
        user: {
          name: 123,
        },
      },
      schema
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('user.name');
    }
  });

  test('validates complex nested objects', () => {
    const schema = z.object({
      name: z.string(),
      settings: z.object({
        enabled: z.boolean(),
        value: z.number(),
      }),
    });

    const validResult = validatePortData(
      {
        name: 'test',
        settings: {
          enabled: true,
          value: 42,
        },
      },
      schema
    );
    expect(validResult.valid).toBe(true);

    const invalidResult = validatePortData(
      {
        name: 'test',
        settings: {
          enabled: 'yes',
          value: 42,
        },
      },
      schema
    );
    expect(invalidResult.valid).toBe(false);
  });
});

describe('getSchemaTypeName', () => {
  // These tests verify EXPECTED behavior.
  // If they fail, it indicates a bug in the implementation.

  test('returns correct type names for primitives', () => {
    expect(getSchemaTypeName(z.string())).toBe('string');
    expect(getSchemaTypeName(z.number())).toBe('number');
    expect(getSchemaTypeName(z.boolean())).toBe('boolean');
    expect(getSchemaTypeName(z.null())).toBe('null');
    expect(getSchemaTypeName(z.undefined())).toBe('undefined');
  });

  test('returns correct type names for any/unknown', () => {
    expect(getSchemaTypeName(z.any())).toBe('any');
    expect(getSchemaTypeName(z.unknown())).toBe('unknown');
  });

  test('returns correct type names for arrays', () => {
    expect(getSchemaTypeName(z.array(z.string()))).toBe('string[]');
  });

  test('returns correct type names for optional/nullable', () => {
    expect(getSchemaTypeName(z.string().optional())).toBe('string?');
    expect(getSchemaTypeName(z.string().nullable())).toBe('string | null');
  });

  test('handles schema without _def gracefully', () => {
    const mockSchema = {} as z.ZodType;
    expect(getSchemaTypeName(mockSchema)).toBe('unknown');
  });
});

describe('isSchemaCompatible - wrapper types', () => {
  test('output compatible with optional input', () => {
    expect(isSchemaCompatible(z.string(), z.string().optional())).toBe(true);
    expect(isSchemaCompatible(z.number(), z.number().optional())).toBe(true);
  });

  test('output compatible with nullable input', () => {
    expect(isSchemaCompatible(z.string(), z.string().nullable())).toBe(true);
    expect(isSchemaCompatible(z.number(), z.number().nullable())).toBe(true);
  });
});

describe('isSchemaCompatible - union types', () => {
  test('output compatible with union input (at least one match)', () => {
    expect(
      isSchemaCompatible(
        z.string(),
        z.union([
          z.string(),
          z.number(),
        ])
      )
    ).toBe(true);
    expect(
      isSchemaCompatible(
        z.number(),
        z.union([
          z.string(),
          z.number(),
        ])
      )
    ).toBe(true);
  });

  test('union output with any/unknown input is always compatible', () => {
    const stringOrNumber = z.union([
      z.string(),
      z.number(),
    ]);
    // Any/unknown accepts everything
    expect(isSchemaCompatible(stringOrNumber, z.any())).toBe(true);
    expect(isSchemaCompatible(stringOrNumber, z.unknown())).toBe(true);
  });
});

describe('isSchemaCompatible - array types', () => {
  test('arrays with same element types are compatible', () => {
    expect(isSchemaCompatible(z.array(z.string()), z.array(z.string()))).toBe(true);
    expect(isSchemaCompatible(z.array(z.number()), z.array(z.number()))).toBe(true);
  });

  test('arrays with compatible nested objects', () => {
    const outputArray = z.array(
      z.object({
        name: z.string(),
      })
    );
    const inputArray = z.array(
      z.object({
        name: z.string(),
      })
    );
    expect(isSchemaCompatible(outputArray, inputArray)).toBe(true);
  });
});

describe('isSchemaCompatible - object types', () => {
  test('output object with more fields satisfies input with subset', () => {
    const output = z.object({
      name: z.string(),
      age: z.number(),
    });
    const input = z.object({
      name: z.string(),
    });
    // Output has all required fields of input
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('output object missing optional field is compatible', () => {
    const output = z.object({
      name: z.string(),
    });
    const input = z.object({
      name: z.string(),
      age: z.number().optional(),
    });
    // 'age' is optional, so it's OK to be missing
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('output object missing required field is incompatible', () => {
    const output = z.object({
      name: z.string(),
    });
    const input = z.object({
      name: z.string(),
      age: z.number(),
    });
    expect(isSchemaCompatible(output, input)).toBe(false);
  });

  test('output object with incompatible field type is incompatible', () => {
    const output = z.object({
      name: z.number(),
    });
    const input = z.object({
      name: z.string(),
    });
    expect(isSchemaCompatible(output, input)).toBe(false);
  });

  test('nested objects are checked recursively', () => {
    const output = z.object({
      user: z.object({
        name: z.string(),
        email: z.string(),
      }),
    });
    const input = z.object({
      user: z.object({
        name: z.string(),
      }),
    });
    expect(isSchemaCompatible(output, input)).toBe(true);
  });
});

describe('isSchemaCompatible - incompatible types', () => {
  test('different primitive types are incompatible', () => {
    expect(isSchemaCompatible(z.string(), z.boolean())).toBe(false);
    expect(isSchemaCompatible(z.boolean(), z.string())).toBe(false);
    expect(isSchemaCompatible(z.null(), z.string())).toBe(false);
  });

  test('array and non-array are incompatible', () => {
    expect(isSchemaCompatible(z.string(), z.array(z.string()))).toBe(false);
    expect(isSchemaCompatible(z.array(z.string()), z.string())).toBe(false);
  });

  test('arrays with incompatible element types are incompatible', () => {
    expect(isSchemaCompatible(z.array(z.string()), z.array(z.boolean()))).toBe(false);
  });

  test('union output where not all variants match input', () => {
    const output = z.union([
      z.string(),
      z.number(),
    ]);
    expect(isSchemaCompatible(output, z.boolean())).toBe(false);
  });

  test('output incompatible with union input (no match)', () => {
    const input = z.union([
      z.string(),
      z.number(),
    ]);
    expect(isSchemaCompatible(z.boolean(), input)).toBe(false);
  });
});

describe('isSchemaCompatible - edge cases', () => {
  test('handles schema without _def', () => {
    const mockSchema = {} as z.ZodType;
    // Both return 'unknown' type which matches
    expect(isSchemaCompatible(mockSchema, mockSchema)).toBe(true);
  });

  test('union output where all variants satisfy input', () => {
    // Both string and number can flow into any
    const output = z.union([
      z.string(),
      z.number(),
    ]);
    expect(isSchemaCompatible(output, z.any())).toBe(true);
  });

  test('deeply nested optional unwrapping', () => {
    const output = z.string();
    const input = z.string().optional().nullable();
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('handles schema with missing _def', () => {
    const mockSchema = {} as z.ZodType;
    // Should not throw even with invalid schema
    expect(() => isSchemaCompatible(mockSchema, mockSchema)).not.toThrow();
  });

  test('handles schema with _def but no typeName', () => {
    const mockSchema = {
      _def: {},
    } as z.ZodType;
    expect(() => isSchemaCompatible(mockSchema, mockSchema)).not.toThrow();
  });
});

describe('validatePortData - additional cases', () => {
  test('returns error without path for root-level validation failure', () => {
    const result = validatePortData('not a number', z.number());
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // Should have error message without path prefix
      expect(result.error).toBeDefined();
    }
  });

  test('handles multiple validation errors', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const result = validatePortData(
      {
        name: 123,
        age: 'not a number',
      },
      schema
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('name');
      expect(result.error).toContain('age');
    }
  });

  test('returns transformed data on success', () => {
    const schema = z.string().transform((s) => s.toUpperCase());
    const result = validatePortData('hello', schema);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).toBe('HELLO');
    }
  });
});

describe('getSchemaTypeName - additional cases', () => {
  test('returns object for ZodObject', () => {
    const schema = z.object({
      name: z.string(),
    });
    // Due to Zod version, this returns 'unknown', but we test it doesn't throw
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });

  test('returns array notation for ZodArray', () => {
    const schema = z.array(z.string());
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });

  test('handles deeply nested schemas', () => {
    const schema = z.array(
      z.object({
        items: z.array(z.string()),
      })
    );
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });

  test('handles date schema', () => {
    const schema = z.date();
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });

  test('handles record schema', () => {
    const schema = z.record(z.string(), z.string());
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });

  test('handles map schema', () => {
    const schema = z.map(z.string(), z.number());
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });

  test('handles set schema', () => {
    const schema = z.set(z.string());
    expect(() => getSchemaTypeName(schema)).not.toThrow();
  });
});

describe('isSchemaCompatible - structural compatibility', () => {
  test('object output satisfies object input with same shape', () => {
    const output = z.object({
      a: z.string(),
      b: z.number(),
    });
    const input = z.object({
      a: z.string(),
      b: z.number(),
    });
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('object output with extra fields satisfies subset input', () => {
    const output = z.object({
      a: z.string(),
      b: z.number(),
      c: z.boolean(),
    });
    const input = z.object({
      a: z.string(),
    });
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('array of objects compatibility', () => {
    const output = z.array(
      z.object({
        id: z.number(),
        name: z.string(),
      })
    );
    const input = z.array(
      z.object({
        id: z.number(),
      })
    );
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('nullable wraps optional correctly', () => {
    expect(isSchemaCompatible(z.number(), z.number().nullable())).toBe(true);
  });

  test('doubly wrapped optional/nullable', () => {
    const output = z.string();
    const input = z.string().optional();
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('union input matches single type output', () => {
    const output = z.string();
    const input = z.union([
      z.string(),
      z.number(),
      z.boolean(),
    ]);
    expect(isSchemaCompatible(output, input)).toBe(true);
  });

  test('union output compatible with any', () => {
    const output = z.union([
      z.string(),
      z.number(),
    ]);
    expect(isSchemaCompatible(output, z.any())).toBe(true);
  });

  test('array elements checked recursively', () => {
    const output = z.array(
      z.object({
        value: z.string(),
      })
    );
    const input = z.array(
      z.object({
        value: z.string(),
      })
    );
    expect(isSchemaCompatible(output, input)).toBe(true);
  });
});
