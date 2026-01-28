/**
 * Tests for port utilities
 */

import { describe, expect, test } from 'bun:test';
import { createPortRef, parsePortRef } from '../types/ports';

describe('parsePortRef', () => {
  test('parses valid port reference', () => {
    const result = parsePortRef('block-a:output');

    expect(result.blockId).toBe('block-a');
    expect(result.portId).toBe('output');
  });

  test('handles port ID with multiple colons', () => {
    // First colon separates block ID, rest is port ID
    const result = parsePortRef('block-a:port:with:colons');

    expect(result.blockId).toBe('block-a');
    expect(result.portId).toBe('port:with:colons');
  });

  test('throws for invalid reference without colon', () => {
    expect(() => parsePortRef('invalid' as `${string}:${string}`)).toThrow(
      'Invalid port reference'
    );
  });
});

describe('createPortRef', () => {
  test('creates valid port reference', () => {
    const ref = createPortRef('block-a', 'output');

    expect(ref).toBe('block-a:output');
  });

  test('throws when block ID contains colon', () => {
    expect(() => createPortRef('block:a', 'output')).toThrow('cannot contain ":"');
  });

  test('throws when port ID contains colon', () => {
    expect(() => createPortRef('block-a', 'out:put')).toThrow('cannot contain ":"');
  });
});
