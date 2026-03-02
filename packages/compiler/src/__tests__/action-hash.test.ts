import { describe, expect, test } from 'bun:test';
import { computeActionId } from '../action-hash';

describe('computeActionId', () => {
  test('returns 12-char hex string', () => {
    const id = computeActionId('src/actions.ts', 'scan');
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  test('is deterministic', () => {
    const a = computeActionId('src/actions.ts', 'scan');
    const b = computeActionId('src/actions.ts', 'scan');
    expect(a).toBe(b);
  });

  test('differs for different export names', () => {
    const a = computeActionId('src/actions.ts', 'scan');
    const b = computeActionId('src/actions.ts', 'play');
    expect(a).not.toBe(b);
  });

  test('differs for different paths', () => {
    const a = computeActionId('src/actions.ts', 'scan');
    const b = computeActionId('src/other.ts', 'scan');
    expect(a).not.toBe(b);
  });
});
