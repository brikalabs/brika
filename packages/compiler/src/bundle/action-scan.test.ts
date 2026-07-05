import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computeActionId } from './action-scan';

describe('computeActionId', () => {
  test('is SHA-256(path\\0name) truncated to 12 hex chars', async () => {
    // Independent node:crypto derivation pins the format: the prelude and any
    // future implementation must keep producing exactly this value.
    const expected = createHash('sha256').update('src/actions.ts\0scan').digest('hex').slice(0, 12);
    expect(await computeActionId('src/actions.ts', 'scan')).toBe(expected);
  });

  test('is deterministic and sensitive to both path and name', async () => {
    const id = await computeActionId('src/actions.ts', 'scan');
    expect(await computeActionId('src/actions.ts', 'scan')).toBe(id);
    expect(await computeActionId('src/actions.ts', 'play')).not.toBe(id);
    expect(await computeActionId('src/other.ts', 'scan')).not.toBe(id);
  });
});
