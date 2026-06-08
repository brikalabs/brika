import { describe, expect, test } from 'bun:test';
import { DEFAULT_FS_QUOTAS, resolveFsQuotas } from './types';

describe('resolveFsQuotas', () => {
  test('falls back to the hub defaults when no overrides are given', () => {
    expect(resolveFsQuotas(undefined)).toEqual(DEFAULT_FS_QUOTAS);
    expect(resolveFsQuotas({})).toEqual(DEFAULT_FS_QUOTAS);
  });

  test('merges a single declared root over the defaults', () => {
    const resolved = resolveFsQuotas({ data: 123 });
    expect(resolved.data).toBe(123);
    expect(resolved.cache).toBe(DEFAULT_FS_QUOTAS.cache);
    expect(resolved.tmp).toBe(DEFAULT_FS_QUOTAS.tmp);
  });

  test('each root overrides independently', () => {
    expect(resolveFsQuotas({ data: 1, cache: 2, tmp: 3 })).toEqual({
      data: 1,
      cache: 2,
      tmp: 3,
    });
  });
});
