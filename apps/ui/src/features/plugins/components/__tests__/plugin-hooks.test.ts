/**
 * Unit tests for the pure helpers exported alongside the React hooks
 * in `plugin-hooks.ts`. The hooks themselves are exercised end-to-end
 * by the playground and the existing Cypress/e2e flows; here we cover
 * just the deterministic plumbing — encoding, error parsing, error
 * dispatch — that we can poke at without a React renderer.
 */

import { describe, expect, mock, test } from 'bun:test';

// `react-i18next` pulls a lot of host machinery the unit test doesn't need.
// Stub it so importing `plugin-hooks.ts` doesn't drag the i18n runtime in.
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
mock.module('@/lib/use-locale', () => ({
  useLocale: () => ({
    locale: 'en',
    changeLocale: () => Promise.resolve(),
    formatDate: () => '',
    formatTime: () => '',
    formatDateTime: () => '',
    formatRelativeTime: () => '',
    formatNumber: () => '',
    formatCurrency: () => '',
    formatList: () => '',
    tp: () => '',
  }),
}));
mock.module('@brika/clay', () => ({
  toast: {
    error: mock(() => {
      /* noop */
    }),
  },
}));

const { ActionError } = await import('../plugin-hooks');

describe('ActionError', () => {
  test('preserves status, code, originalName, and data', () => {
    const err = new ActionError('boom', {
      status: 500,
      code: 'EPERM',
      originalName: 'Error',
      data: { permission: 'fs.read' },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ActionError');
    expect(err.message).toBe('boom');
    expect(err.status).toBe(500);
    expect(err.code).toBe('EPERM');
    expect(err.originalName).toBe('Error');
    expect(err.data).toEqual({ permission: 'fs.read' });
  });

  test('fromUnknown wraps a plain Error', () => {
    const cause = new TypeError('bad input');
    const err = ActionError.fromUnknown(cause, 400);
    expect(err.message).toBe('bad input');
    expect(err.originalName).toBe('TypeError');
    expect(err.status).toBe(400);
  });

  test('fromUnknown passes ActionError through unchanged', () => {
    const original = new ActionError('orig', { status: 502, code: 'BAD_GATEWAY' });
    const result = ActionError.fromUnknown(original);
    expect(result).toBe(original);
  });

  test('fromUnknown coerces non-Error throws', () => {
    expect(ActionError.fromUnknown('text').message).toBe('text');
    expect(ActionError.fromUnknown(42).message).toBe('42');
    expect(ActionError.fromUnknown(null).message).toBe('null');
  });
});
