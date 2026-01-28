/**
 * Tests for SDK schema types
 */

import { describe, expect, test } from 'bun:test';
import {
  code,
  color,
  duration,
  expression,
  filePath,
  generic,
  getTypeMarker,
  isGenericRef,
  isPassthroughRef,
  isResolvedRef,
  jsonSchema,
  parseResolvedMarker,
  passthrough,
  resolved,
  secret,
  sparkType,
  TypeMarker,
  urlSchema,
} from '../blocks/schema-types';

// ─────────────────────────────────────────────────────────────────────────────
// getTypeMarker
// ─────────────────────────────────────────────────────────────────────────────

describe('getTypeMarker', () => {
  test('returns null for undefined description', () => {
    expect(getTypeMarker(undefined)).toBeNull();
  });

  test('returns null for empty description', () => {
    expect(getTypeMarker('')).toBeNull();
  });

  test('returns null for description without marker', () => {
    expect(getTypeMarker('Just a regular description')).toBeNull();
  });

  test('detects COLOR marker', () => {
    expect(getTypeMarker(TypeMarker.COLOR)).toBe(TypeMarker.COLOR);
    expect(getTypeMarker(`${TypeMarker.COLOR} Pick a color`)).toBe(TypeMarker.COLOR);
  });

  test('detects DURATION marker', () => {
    expect(getTypeMarker(TypeMarker.DURATION)).toBe(TypeMarker.DURATION);
  });

  test('detects EXPRESSION marker', () => {
    expect(getTypeMarker(TypeMarker.EXPRESSION)).toBe(TypeMarker.EXPRESSION);
  });

  test('detects CODE marker', () => {
    expect(getTypeMarker(`${TypeMarker.CODE}:javascript`)).toBe(TypeMarker.CODE);
  });

  test('detects SECRET marker', () => {
    expect(getTypeMarker(TypeMarker.SECRET)).toBe(TypeMarker.SECRET);
  });

  test('detects FILE_PATH marker', () => {
    expect(getTypeMarker(TypeMarker.FILE_PATH)).toBe(TypeMarker.FILE_PATH);
  });

  test('detects URL marker', () => {
    expect(getTypeMarker(TypeMarker.URL)).toBe(TypeMarker.URL);
  });

  test('detects JSON marker', () => {
    expect(getTypeMarker(TypeMarker.JSON)).toBe(TypeMarker.JSON);
  });

  test('detects SPARK_TYPE marker', () => {
    expect(getTypeMarker(TypeMarker.SPARK_TYPE)).toBe(TypeMarker.SPARK_TYPE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// color
// ─────────────────────────────────────────────────────────────────────────────

describe('color', () => {
  test('creates schema with COLOR marker', () => {
    const schema = color();
    expect(schema.description).toBe(TypeMarker.COLOR);
  });

  test('creates schema with custom description', () => {
    const schema = color('Pick a theme color');
    expect(schema.description).toBe(`${TypeMarker.COLOR} Pick a theme color`);
  });

  test('validates hex colors', () => {
    const schema = color();
    expect(schema.safeParse('#FF0000').success).toBe(true);
    expect(schema.safeParse('#00ff00').success).toBe(true);
    expect(schema.safeParse('#123abc').success).toBe(true);
  });

  test('rejects invalid colors', () => {
    const schema = color();
    expect(schema.safeParse('red').success).toBe(false);
    expect(schema.safeParse('#FFF').success).toBe(false); // 3-char not supported
    expect(schema.safeParse('#GGGGGG').success).toBe(false);
    expect(schema.safeParse('').success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// duration
// ─────────────────────────────────────────────────────────────────────────────

describe('duration', () => {
  test('creates schema with DURATION marker', () => {
    const schema = duration();
    expect(schema.description).toBe(TypeMarker.DURATION);
  });

  test('creates schema with custom description', () => {
    const schema = duration(undefined, 'Timeout period');
    expect(schema.description).toBe(`${TypeMarker.DURATION} Timeout period`);
  });

  test('validates positive integers', () => {
    const schema = duration();
    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse(1000).success).toBe(true);
    expect(schema.safeParse(3600000).success).toBe(true);
  });

  test('rejects negative numbers', () => {
    const schema = duration();
    expect(schema.safeParse(-1).success).toBe(false);
  });

  test('rejects non-integers', () => {
    const schema = duration();
    expect(schema.safeParse(1.5).success).toBe(false);
  });

  test('applies min constraint', () => {
    const schema = duration({ min: 100 });
    expect(schema.safeParse(99).success).toBe(false);
    expect(schema.safeParse(100).success).toBe(true);
  });

  test('applies max constraint', () => {
    const schema = duration({ max: 1000 });
    expect(schema.safeParse(1000).success).toBe(true);
    expect(schema.safeParse(1001).success).toBe(false);
  });

  test('applies both min and max', () => {
    const schema = duration({ min: 100, max: 1000 });
    expect(schema.safeParse(99).success).toBe(false);
    expect(schema.safeParse(100).success).toBe(true);
    expect(schema.safeParse(500).success).toBe(true);
    expect(schema.safeParse(1000).success).toBe(true);
    expect(schema.safeParse(1001).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// expression
// ─────────────────────────────────────────────────────────────────────────────

describe('expression', () => {
  test('creates schema with EXPRESSION marker', () => {
    const schema = expression();
    expect(schema.description).toBe(TypeMarker.EXPRESSION);
  });

  test('creates schema with custom description', () => {
    const schema = expression('JavaScript expression');
    expect(schema.description).toBe(`${TypeMarker.EXPRESSION} JavaScript expression`);
  });

  test('accepts any string', () => {
    const schema = expression();
    expect(schema.safeParse('{{value}} + 1').success).toBe(true);
    expect(schema.safeParse('Math.random()').success).toBe(true);
    expect(schema.safeParse('').success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// code
// ─────────────────────────────────────────────────────────────────────────────

describe('code', () => {
  test('creates schema with CODE marker and language', () => {
    const schema = code('javascript');
    expect(schema.description).toBe(`${TypeMarker.CODE}:javascript`);
  });

  test('creates schema with custom description', () => {
    const schema = code('json', 'Configuration JSON');
    expect(schema.description).toBe(`${TypeMarker.CODE}:json Configuration JSON`);
  });

  test('accepts any string', () => {
    const schema = code('typescript');
    expect(schema.safeParse('const x = 1;').success).toBe(true);
    expect(schema.safeParse('').success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// secret
// ─────────────────────────────────────────────────────────────────────────────

describe('secret', () => {
  test('creates schema with SECRET marker', () => {
    const schema = secret();
    expect(schema.description).toBe(TypeMarker.SECRET);
  });

  test('creates schema with custom description', () => {
    const schema = secret('API key');
    expect(schema.description).toBe(`${TypeMarker.SECRET} API key`);
  });

  test('accepts any string', () => {
    const schema = secret();
    expect(schema.safeParse('super-secret-key').success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filePath
// ─────────────────────────────────────────────────────────────────────────────

describe('filePath', () => {
  test('creates schema with FILE_PATH marker', () => {
    const schema = filePath();
    expect(schema.description).toBe(TypeMarker.FILE_PATH);
  });

  test('creates schema with custom description', () => {
    const schema = filePath('Output file');
    expect(schema.description).toBe(`${TypeMarker.FILE_PATH} Output file`);
  });

  test('accepts any string', () => {
    const schema = filePath();
    expect(schema.safeParse('/path/to/file.txt').success).toBe(true);
    expect(schema.safeParse('C:\\Windows\\file.txt').success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// urlSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('urlSchema', () => {
  test('creates schema with URL marker', () => {
    const schema = urlSchema();
    expect(schema.description).toBe(TypeMarker.URL);
  });

  test('creates schema with custom description', () => {
    const schema = urlSchema('Webhook endpoint');
    expect(schema.description).toBe(`${TypeMarker.URL} Webhook endpoint`);
  });

  test('validates URLs', () => {
    const schema = urlSchema();
    expect(schema.safeParse('https://example.com').success).toBe(true);
    expect(schema.safeParse('http://localhost:3000').success).toBe(true);
  });

  test('rejects invalid URLs', () => {
    const schema = urlSchema();
    expect(schema.safeParse('not a url').success).toBe(false);
    expect(schema.safeParse('').success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// jsonSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('jsonSchema', () => {
  test('creates schema with JSON marker', () => {
    const schema = jsonSchema();
    expect(schema.description).toBe(TypeMarker.JSON);
  });

  test('creates schema with custom description', () => {
    const schema = jsonSchema('Raw config');
    expect(schema.description).toBe(`${TypeMarker.JSON} Raw config`);
  });

  test('accepts any string', () => {
    const schema = jsonSchema();
    expect(schema.safeParse('{"key": "value"}').success).toBe(true);
    expect(schema.safeParse('invalid json').success).toBe(true); // Just a string schema
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sparkType
// ─────────────────────────────────────────────────────────────────────────────

describe('sparkType', () => {
  test('creates schema with SPARK_TYPE marker', () => {
    const schema = sparkType();
    expect(schema.description).toBe(TypeMarker.SPARK_TYPE);
  });

  test('creates schema with custom description', () => {
    const schema = sparkType('Select event type');
    expect(schema.description).toBe(`${TypeMarker.SPARK_TYPE} Select event type`);
  });

  test('accepts any string', () => {
    const schema = sparkType();
    expect(schema.safeParse('timer:timer-started').success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe('passthrough', () => {
  test('creates PassthroughRef with correct properties', () => {
    const ref = passthrough('in');
    expect(ref.__type).toBe('passthrough');
    expect(ref.__passthrough).toBe('in');
    expect(ref._schema).toBeDefined();
  });

  test('preserves port ID in description', () => {
    const ref = passthrough('myInput');
    expect(ref._schema.description).toContain('myInput');
  });
});

describe('isPassthroughRef', () => {
  test('returns true for PassthroughRef', () => {
    const ref = passthrough('in');
    expect(isPassthroughRef(ref)).toBe(true);
  });

  test('returns false for null', () => {
    expect(isPassthroughRef(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isPassthroughRef(undefined)).toBe(false);
  });

  test('returns false for plain objects', () => {
    expect(isPassthroughRef({})).toBe(false);
    expect(isPassthroughRef({ __type: 'other' })).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(isPassthroughRef('passthrough')).toBe(false);
    expect(isPassthroughRef(123)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generic
// ─────────────────────────────────────────────────────────────────────────────

describe('generic', () => {
  test('creates GenericRef with default type variable', () => {
    const ref = generic();
    expect(ref.__type).toBe('generic');
    expect(ref.__generic).toBe('T');
    expect(ref._schema).toBeDefined();
  });

  test('creates GenericRef with custom type variable', () => {
    const ref = generic('TInput');
    expect(ref.__generic).toBe('TInput');
  });

  test('includes type variable in description', () => {
    const ref = generic('MyType');
    expect(ref._schema.description).toContain('MyType');
  });
});

describe('isGenericRef', () => {
  test('returns true for GenericRef', () => {
    const ref = generic();
    expect(isGenericRef(ref)).toBe(true);
  });

  test('returns false for null', () => {
    expect(isGenericRef(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isGenericRef(undefined)).toBe(false);
  });

  test('returns false for plain objects', () => {
    expect(isGenericRef({})).toBe(false);
    expect(isGenericRef({ __type: 'other' })).toBe(false);
  });

  test('returns false for PassthroughRef', () => {
    const ref = passthrough('in');
    expect(isGenericRef(ref)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolved
// ─────────────────────────────────────────────────────────────────────────────

describe('resolved', () => {
  test('creates ResolvedRef with correct properties', () => {
    const ref = resolved('spark', 'sparkType');
    expect(ref.__type).toBe('resolved');
    expect(ref.__source).toBe('spark');
    expect(ref.__configField).toBe('sparkType');
    expect(ref._schema).toBeDefined();
  });

  test('includes source and config field in description', () => {
    const ref = resolved('spark', 'eventType');
    expect(ref._schema.description).toContain('spark');
    expect(ref._schema.description).toContain('eventType');
  });
});

describe('isResolvedRef', () => {
  test('returns true for ResolvedRef', () => {
    const ref = resolved('spark', 'sparkType');
    expect(isResolvedRef(ref)).toBe(true);
  });

  test('returns false for null', () => {
    expect(isResolvedRef(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isResolvedRef(undefined)).toBe(false);
  });

  test('returns false for plain objects', () => {
    expect(isResolvedRef({})).toBe(false);
  });

  test('returns false for other ref types', () => {
    expect(isResolvedRef(generic())).toBe(false);
    expect(isResolvedRef(passthrough('in'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseResolvedMarker
// ─────────────────────────────────────────────────────────────────────────────

describe('parseResolvedMarker', () => {
  test('parses valid resolved marker', () => {
    const result = parseResolvedMarker('$resolve:spark:sparkType');
    expect(result).toEqual({ source: 'spark', configField: 'sparkType' });
  });

  test('returns null for undefined', () => {
    expect(parseResolvedMarker(undefined)).toBeNull();
  });

  test('returns null for non-resolved marker', () => {
    expect(parseResolvedMarker('generic<T>')).toBeNull();
    expect(parseResolvedMarker('$passthrough:in')).toBeNull();
  });

  test('returns null for incomplete marker', () => {
    expect(parseResolvedMarker('$resolve:')).toBeNull();
    expect(parseResolvedMarker('$resolve:spark')).toBeNull();
    expect(parseResolvedMarker('$resolve:spark:')).toBeNull();
  });

  test('handles markers with extra colons', () => {
    const result = parseResolvedMarker('$resolve:spark:config:extra');
    // Should only use first two parts
    expect(result).toEqual({ source: 'spark', configField: 'config' });
  });
});
