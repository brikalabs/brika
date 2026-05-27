/**
 * Self-check probe tests.
 *
 * `runSelfCheck()` is pure and exposed for exactly this use — we
 * never have to fork a subprocess just to verify the JSON shape.
 */

import { describe, expect, test } from 'bun:test';
import { runSelfCheck } from './self-check';

describe('runSelfCheck', () => {
  test('returns ok: true with the embedded version string', () => {
    const result = runSelfCheck();
    expect(result.ok).toBe(true);
    expect(typeof result.version).toBe('string');
    expect(result.version.length).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  test('result shape is JSON-serialisable (orchestrator parses one line)', () => {
    const result = runSelfCheck();
    const roundTrip = JSON.parse(JSON.stringify(result));
    expect(roundTrip.ok).toBe(result.ok);
    expect(roundTrip.version).toBe(result.version);
  });
});
