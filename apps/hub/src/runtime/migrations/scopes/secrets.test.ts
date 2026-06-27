/**
 * Secrets scope tests — the v1 stamp is a no-op by design, but
 * we still pin its shape so a future contributor can't silently
 * change the contract (e.g. promote it to actually touch the
 * secret store) without bumping the ID.
 */

import { describe, expect, test } from 'bun:test';
import { secretsScope } from './secrets';

describe('secrets scope', () => {
  test('has a single stamp-v1 migration', () => {
    expect(secretsScope.name).toBe('secrets');
    expect(secretsScope.migrations).toHaveLength(1);
    expect(secretsScope.migrations[0]?.id).toBe('0001-stamp-v1');
  });

  test('the stamp migration is a no-op (recorded, never surfaced as changed)', async () => {
    const result = await secretsScope.migrations[0]?.run({
      brikaDir: '/tmp/anywhere',
      toVersion: '0.6.0',
      fromVersion: '0.5.0',
    });
    expect(result).toEqual({ changed: false });
  });

  test('description survives — operator-facing audit text', () => {
    expect(secretsScope.migrations[0]?.description.length).toBeGreaterThan(0);
  });
});
