import { describe, expect, test } from 'bun:test';
import { classifyNetworkError } from './network';

describe('classifyNetworkError', () => {
  test('DNS failures are offline', () => {
    expect(classifyNetworkError({ code: 'ENOTFOUND' })).toBe('offline');
    expect(classifyNetworkError({ code: 'EAI_AGAIN' })).toBe('offline');
  });

  test('refused/reset/unreachable are unreachable', () => {
    expect(classifyNetworkError({ code: 'ECONNREFUSED' })).toBe('unreachable');
    expect(classifyNetworkError({ code: 'ECONNRESET' })).toBe('unreachable');
    expect(classifyNetworkError({ code: 'ENETUNREACH' })).toBe('unreachable');
  });

  test('timeouts: ETIMEDOUT code and AbortSignal.timeout TimeoutError', () => {
    expect(classifyNetworkError({ code: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyNetworkError({ name: 'TimeoutError' })).toBe('timeout');
  });

  test('reads the code off err.cause (fetch failures)', () => {
    expect(classifyNetworkError({ cause: { code: 'ENOTFOUND' } })).toBe('offline');
    expect(
      classifyNetworkError(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }))
    ).toBe('unreachable');
  });

  test('non-network errors return null (never masked as offline)', () => {
    expect(classifyNetworkError(new Error('boom'))).toBeNull();
    expect(classifyNetworkError({ code: 'EACCES' })).toBeNull();
    expect(classifyNetworkError(null)).toBeNull();
    expect(classifyNetworkError('nope')).toBeNull();
  });
});
