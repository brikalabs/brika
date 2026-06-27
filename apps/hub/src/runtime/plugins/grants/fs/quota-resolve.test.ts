import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_FS_QUOTAS, resolveFsQuotas, setOperatorFsQuotas } from './types';

describe('resolveFsQuotas precedence', () => {
  afterEach(() => {
    // Reset the module-level operator override so tests don't leak into each other.
    setOperatorFsQuotas(undefined);
  });

  test('falls back to the built-in defaults when nothing is set', () => {
    expect(resolveFsQuotas()).toEqual(DEFAULT_FS_QUOTAS);
  });

  test('operator defaults override the built-ins per root', () => {
    setOperatorFsQuotas({ data: 123, cache: 456 });
    expect(resolveFsQuotas()).toEqual({
      data: 123,
      cache: 456,
      tmp: DEFAULT_FS_QUOTAS.tmp, // omitted root keeps the built-in
    });
  });

  test("a plugin's own quotas win over the operator default", () => {
    setOperatorFsQuotas({ data: 123 });
    expect(resolveFsQuotas({ data: 999 }).data).toBe(999);
  });

  test('precedence is plugin > operator > built-in', () => {
    setOperatorFsQuotas({ data: 100, cache: 200, tmp: 300 });
    expect(resolveFsQuotas({ data: 999 })).toEqual({ data: 999, cache: 200, tmp: 300 });
  });
});
