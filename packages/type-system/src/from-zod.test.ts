import { describe, expect, it } from 'bun:test';
import type { TypeDescriptor } from './descriptor';
import { fromJsonSchema, zodToDescriptor } from './from-zod';

// ─────────────────────────────────────────────────────────────────────────────
// fromJsonSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('fromJsonSchema', () => {
  describe('primitives', () => {
    it('converts string', () => {
      expect(fromJsonSchema({ type: 'string' })).toEqual({ kind: 'primitive', type: 'string' });
    });

    it('converts number', () => {
      expect(fromJsonSchema({ type: 'number' })).toEqual({ kind: 'primitive', type: 'number' });
    });

    it('converts integer as number', () => {
      expect(fromJsonSchema({ type: 'integer' })).toEqual({ kind: 'primitive', type: 'number' });
    });

    it('converts boolean', () => {
      expect(fromJsonSchema({ type: 'boolean' })).toEqual({ kind: 'primitive', type: 'boolean' });
    });

    it('converts null', () => {
      expect(fromJsonSchema({ type: 'null' })).toEqual({ kind: 'primitive', type: 'null' });
    });

    it('returns unknown for unrecognized type', () => {
      expect(fromJsonSchema({ type: 'never' })).toEqual({ kind: 'unknown' });
    });

    it('returns unknown for missing type', () => {
      expect(fromJsonSchema({})).toEqual({ kind: 'unknown' });
    });
  });

  describe('array', () => {
    it('converts array with items', () => {
      expect(fromJsonSchema({ type: 'array', items: { type: 'string' } })).toEqual({
        kind: 'array',
        element: { kind: 'primitive', type: 'string' },
      });
    });

    it('converts tuple via prefixItems', () => {
      expect(
        fromJsonSchema({
          type: 'array',
          prefixItems: [{ type: 'string' }, { type: 'number' }],
        })
      ).toEqual({
        kind: 'tuple',
        elements: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'number' },
        ],
      });
    });

    it('returns array with unknown element when no items or prefixItems', () => {
      expect(fromJsonSchema({ type: 'array' })).toEqual({
        kind: 'array',
        element: { kind: 'unknown' },
      });
    });
  });

  describe('object', () => {
    it('converts object with properties and required', () => {
      const result = fromJsonSchema({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'number' } },
        required: ['name'],
      });
      expect(result).toEqual({
        kind: 'object',
        fields: {
          name: { type: { kind: 'primitive', type: 'string' }, optional: false },
          age: { type: { kind: 'primitive', type: 'number' }, optional: true },
        },
      });
    });

    it('converts object with all required fields', () => {
      const result = fromJsonSchema({
        type: 'object',
        properties: { x: { type: 'boolean' } },
        required: ['x'],
      });
      const field = (result as Extract<TypeDescriptor, { kind: 'object' }>).fields.x;
      expect(field?.optional).toBe(false);
    });

    it('converts object with no required (all optional)', () => {
      const result = fromJsonSchema({
        type: 'object',
        properties: { x: { type: 'string' } },
      });
      const field = (result as Extract<TypeDescriptor, { kind: 'object' }>).fields.x;
      expect(field?.optional).toBe(true);
    });

    it('converts record with additionalProperties', () => {
      expect(fromJsonSchema({ type: 'object', additionalProperties: { type: 'number' } })).toEqual({
        kind: 'record',
        value: { kind: 'primitive', type: 'number' },
      });
    });

    it('converts record without properties and without additionalProperties', () => {
      expect(fromJsonSchema({ type: 'object' })).toEqual({
        kind: 'record',
        value: { kind: 'unknown' },
      });
    });
  });

  describe('composite schemas', () => {
    it('converts anyOf with multiple variants to union', () => {
      expect(fromJsonSchema({ anyOf: [{ type: 'string' }, { type: 'number' }] })).toEqual({
        kind: 'union',
        variants: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'number' },
        ],
      });
    });

    it('unwraps anyOf with single variant', () => {
      expect(fromJsonSchema({ anyOf: [{ type: 'boolean' }] })).toEqual({
        kind: 'primitive',
        type: 'boolean',
      });
    });

    it('converts oneOf with multiple variants to union', () => {
      expect(fromJsonSchema({ oneOf: [{ type: 'string' }, { type: 'null' }] })).toEqual({
        kind: 'union',
        variants: [
          { kind: 'primitive', type: 'string' },
          { kind: 'primitive', type: 'null' },
        ],
      });
    });

    it('unwraps oneOf with single variant', () => {
      expect(fromJsonSchema({ oneOf: [{ type: 'string' }] })).toEqual({
        kind: 'primitive',
        type: 'string',
      });
    });

    it('converts enum', () => {
      expect(fromJsonSchema({ enum: ['a', 'b', 'c'] })).toEqual({
        kind: 'enum',
        values: ['a', 'b', 'c'],
      });
    });

    it('converts number enum', () => {
      expect(fromJsonSchema({ enum: [1, 2, 3] })).toEqual({ kind: 'enum', values: [1, 2, 3] });
    });

    it('converts const string', () => {
      expect(fromJsonSchema({ const: 'hello' })).toEqual({ kind: 'literal', value: 'hello' });
    });

    it('converts const number', () => {
      expect(fromJsonSchema({ const: 42 })).toEqual({ kind: 'literal', value: 42 });
    });

    it('converts const boolean', () => {
      expect(fromJsonSchema({ const: false })).toEqual({ kind: 'literal', value: false });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zodToDescriptor: marker ref path
// ─────────────────────────────────────────────────────────────────────────────

describe('zodToDescriptor (marker refs)', () => {
  it('converts generic marker with typeVar', () => {
    expect(zodToDescriptor({ __type: 'generic', __generic: 'T' })).toEqual({
      kind: 'generic',
      typeVar: 'T',
    });
  });

  it('converts generic marker with custom typeVar', () => {
    expect(zodToDescriptor({ __type: 'generic', __generic: 'K' })).toEqual({
      kind: 'generic',
      typeVar: 'K',
    });
  });

  it('falls back to T when __generic is missing', () => {
    expect(zodToDescriptor({ __type: 'generic' })).toEqual({
      kind: 'generic',
      typeVar: 'T',
    });
  });

  it('converts passthrough marker with sourcePortId', () => {
    expect(zodToDescriptor({ __type: 'passthrough', __passthrough: 'in' })).toEqual({
      kind: 'passthrough',
      sourcePortId: 'in',
    });
  });

  it('falls back to empty string when __passthrough is missing', () => {
    expect(zodToDescriptor({ __type: 'passthrough' })).toEqual({
      kind: 'passthrough',
      sourcePortId: '',
    });
  });

  it('converts resolved marker', () => {
    expect(
      zodToDescriptor({ __type: 'resolved', __source: 'mySource', __configField: 'myField' })
    ).toEqual({ kind: 'resolved', source: 'mySource', configField: 'myField' });
  });

  it('falls back to empty strings when resolved fields are missing', () => {
    expect(zodToDescriptor({ __type: 'resolved' })).toEqual({
      kind: 'resolved',
      source: '',
      configField: '',
    });
  });

  it('does not treat plain objects without __type as marker', () => {
    // A plain JSON schema object should fall through to fromZodViaJsonSchema
    const result = zodToDescriptor({ type: 'string' });
    // With no Zod toJSONSchema available, falls to constructor-based detection,
    // which finds no matching ZodXxx constructor, returns unknown
    expect(result.kind).toBe('unknown');
  });

  it('does not treat null as a marker', () => {
    const result = zodToDescriptor(null);
    expect(result.kind).toBe('unknown');
  });

  it('does not treat a string as a marker', () => {
    const result = zodToDescriptor('string');
    expect(result.kind).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zodToDescriptor: Zod-constructor fallback path (fake Zod-shaped objects)
// ─────────────────────────────────────────────────────────────────────────────

describe('zodToDescriptor (constructor fallback)', () => {
  // Build minimal fake Zod schema instances using classes whose names start with "Zod"

  class ZodString {
    readonly _def = {};
  }

  class ZodNumber {
    readonly _def = {};
  }

  class ZodBoolean {
    readonly _def = {};
  }

  class ZodNull {
    readonly _def = {};
  }

  class ZodAny {
    readonly _def = {};
  }

  class ZodUnknown {
    readonly _def = {};
  }

  class ZodUndefined {
    readonly _def = {};
  }

  class ZodRecord {
    readonly _def = {};
  }

  class ZodArray {
    constructor(readonly _def: Record<string, unknown>) {}
  }

  class ZodObject {
    constructor(readonly _def: Record<string, unknown>) {}
  }

  class ZodOptional {
    constructor(readonly _def: Record<string, unknown>) {}
  }

  class ZodNullable {
    constructor(readonly _def: Record<string, unknown>) {}
  }

  class ZodUnion {
    constructor(readonly _def: Record<string, unknown>) {}
  }

  class ZodEnum {
    constructor(readonly _def: Record<string, unknown>) {}
  }

  it('identifies ZodString as primitive string', () => {
    expect(zodToDescriptor(new ZodString())).toEqual({ kind: 'primitive', type: 'string' });
  });

  it('identifies ZodNumber as primitive number', () => {
    expect(zodToDescriptor(new ZodNumber())).toEqual({ kind: 'primitive', type: 'number' });
  });

  it('identifies ZodBoolean as primitive boolean', () => {
    expect(zodToDescriptor(new ZodBoolean())).toEqual({ kind: 'primitive', type: 'boolean' });
  });

  it('identifies ZodNull as primitive null', () => {
    expect(zodToDescriptor(new ZodNull())).toEqual({ kind: 'primitive', type: 'null' });
  });

  it('identifies ZodAny as any', () => {
    expect(zodToDescriptor(new ZodAny())).toEqual({ kind: 'any' });
  });

  it('identifies ZodUnknown as unknown', () => {
    expect(zodToDescriptor(new ZodUnknown())).toEqual({ kind: 'unknown' });
  });

  it('identifies ZodUndefined as unknown', () => {
    expect(zodToDescriptor(new ZodUndefined())).toEqual({ kind: 'unknown' });
  });

  it('identifies ZodRecord as record', () => {
    expect(zodToDescriptor(new ZodRecord())).toEqual({
      kind: 'record',
      value: { kind: 'unknown' },
    });
  });

  it('converts ZodArray with element', () => {
    const inner = new ZodString();
    const arr = new ZodArray({ element: inner });
    expect(zodToDescriptor(arr)).toEqual({
      kind: 'array',
      element: { kind: 'primitive', type: 'string' },
    });
  });

  it('converts ZodArray with type field as fallback', () => {
    const inner = new ZodNumber();
    const arr = new ZodArray({ type: inner });
    expect(zodToDescriptor(arr)).toEqual({
      kind: 'array',
      element: { kind: 'primitive', type: 'number' },
    });
  });

  it('converts ZodArray with no element to unknown', () => {
    const arr = new ZodArray({});
    expect(zodToDescriptor(arr)).toEqual({ kind: 'array', element: { kind: 'unknown' } });
  });

  it('converts ZodObject with shape', () => {
    const obj = new ZodObject({
      shape: { name: new ZodString(), age: new ZodNumber() },
    });
    expect(zodToDescriptor(obj)).toEqual({
      kind: 'object',
      fields: {
        name: { type: { kind: 'primitive', type: 'string' }, optional: false },
        age: { type: { kind: 'primitive', type: 'number' }, optional: false },
      },
    });
  });

  it('converts ZodObject with optional field', () => {
    const innerStr = new ZodString();
    const optField = new ZodOptional({ innerType: innerStr });
    const obj = new ZodObject({ shape: { label: optField } });
    expect(zodToDescriptor(obj)).toEqual({
      kind: 'object',
      fields: {
        label: { type: { kind: 'primitive', type: 'string' }, optional: true },
      },
    });
  });

  it('converts ZodObject without shape to record', () => {
    const obj = new ZodObject({});
    expect(zodToDescriptor(obj)).toEqual({ kind: 'record', value: { kind: 'unknown' } });
  });

  it('converts ZodOptional by unwrapping innerType', () => {
    const inner = new ZodBoolean();
    const opt = new ZodOptional({ innerType: inner });
    expect(zodToDescriptor(opt)).toEqual({ kind: 'primitive', type: 'boolean' });
  });

  it('converts ZodNullable by unwrapping innerType', () => {
    const inner = new ZodString();
    const nullable = new ZodNullable({ innerType: inner });
    expect(zodToDescriptor(nullable)).toEqual({ kind: 'primitive', type: 'string' });
  });

  it('converts ZodOptional with unwrapped fallback when no innerType', () => {
    const inner = new ZodString();
    const opt = new ZodOptional({ unwrapped: inner });
    expect(zodToDescriptor(opt)).toEqual({ kind: 'primitive', type: 'string' });
  });

  it('converts ZodUnion with options', () => {
    const uni = new ZodUnion({ options: [new ZodString(), new ZodNumber()] });
    expect(zodToDescriptor(uni)).toEqual({
      kind: 'union',
      variants: [
        { kind: 'primitive', type: 'string' },
        { kind: 'primitive', type: 'number' },
      ],
    });
  });

  it('converts ZodUnion with no options to unknown', () => {
    const uni = new ZodUnion({});
    expect(zodToDescriptor(uni)).toEqual({ kind: 'unknown' });
  });

  it('converts ZodEnum with values array', () => {
    const enm = new ZodEnum({ values: ['a', 'b'] });
    expect(zodToDescriptor(enm)).toEqual({ kind: 'enum', values: ['a', 'b'] });
  });

  it('converts ZodEnum with entries array', () => {
    const enm = new ZodEnum({ entries: ['x', 'y'] });
    expect(zodToDescriptor(enm)).toEqual({ kind: 'enum', values: ['x', 'y'] });
  });

  it('converts ZodEnum with no values to unknown', () => {
    const enm = new ZodEnum({});
    expect(zodToDescriptor(enm)).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for ZodXxx with no recognized constructor suffix', () => {
    class ZodWhatever {
      readonly _def = {};
    }
    expect(zodToDescriptor(new ZodWhatever())).toEqual({ kind: 'unknown' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// zodToDescriptor: __brika_zod path (JSON Schema via toJSONSchema)
// ─────────────────────────────────────────────────────────────────────────────

describe('zodToDescriptor (via __brika_zod toJSONSchema)', () => {
  it('uses __brika_zod.toJSONSchema when present and schema has ~standard', () => {
    const fakeSchema = { '~standard': true };
    const globalWithBrika = globalThis as Record<string, unknown>;
    const prev = globalWithBrika.__brika_zod;

    globalWithBrika.__brika_zod = {
      toJSONSchema: (_s: unknown, _opts: Record<string, unknown>) => ({ type: 'string' }),
    };

    try {
      const result = zodToDescriptor(fakeSchema);
      expect(result).toEqual({ kind: 'primitive', type: 'string' });
    } finally {
      globalWithBrika.__brika_zod = prev;
    }
  });

  it('falls back gracefully when toJSONSchema throws', () => {
    const fakeSchema = { '~standard': true };
    const globalWithBrika = globalThis as Record<string, unknown>;
    const prev = globalWithBrika.__brika_zod;

    globalWithBrika.__brika_zod = {
      toJSONSchema: () => {
        throw new Error('unsupported');
      },
    };

    try {
      // Should not throw; falls through to constructor-based detection
      const result = zodToDescriptor(fakeSchema);
      // No ZodXxx constructor name, so returns unknown
      expect(result.kind).toBe('unknown');
    } finally {
      globalWithBrika.__brika_zod = prev;
    }
  });
});
