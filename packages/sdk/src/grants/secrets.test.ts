/**
 * Unit tests for `grants/secrets.ts` — verifies the key shape, the redact
 * functions, and that the SDK-side placeholder handler throws.
 */

import { describe, expect, test } from 'bun:test';
import {
  SecretKeySchema,
  SecretsDeleteArgsSchema,
  SecretsDeleteResultSchema,
  SecretsGetArgsSchema,
  SecretsGetResultSchema,
  SecretsScopeSchema,
  SecretsSetArgsSchema,
  SecretsSetResultSchema,
  secretsDelete,
  secretsGet,
  secretsSet,
} from './secrets';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: {},
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('SecretsScopeSchema', () => {
  test('accepts empty object', () => {
    expect(SecretsScopeSchema.parse({})).toEqual({});
  });

  test('rejects extra keys (strict)', () => {
    expect(() => SecretsScopeSchema.parse({ extra: true })).toThrow();
  });
});

describe('SecretKeySchema', () => {
  test('accepts a typical key', () => {
    expect(SecretKeySchema.parse('api_token-v1')).toBe('api_token-v1');
    expect(SecretKeySchema.parse('a')).toBe('a');
  });

  test('rejects empty / oversized keys', () => {
    expect(() => SecretKeySchema.parse('')).toThrow();
    expect(() => SecretKeySchema.parse('a'.repeat(129))).toThrow();
  });

  test('rejects keys starting with non-letters', () => {
    expect(() => SecretKeySchema.parse('1abc')).toThrow();
    expect(() => SecretKeySchema.parse('_abc')).toThrow();
  });

  test('rejects forbidden characters', () => {
    expect(() => SecretKeySchema.parse('bad key')).toThrow();
    expect(() => SecretKeySchema.parse('bad/key')).toThrow();
  });

  test('rejects keys containing ".."', () => {
    expect(() => SecretKeySchema.parse('foo..bar')).toThrow(/may not contain/);
  });
});

describe('secrets.get spec', () => {
  test('args + result schemas round-trip', () => {
    expect(SecretsGetArgsSchema.parse({ key: 'a' })).toEqual({ key: 'a' });
    expect(SecretsGetResultSchema.parse({ value: 'v' })).toEqual({ value: 'v' });
    expect(SecretsGetResultSchema.parse({ value: null })).toEqual({ value: null });
  });

  test('redact.result hides value entirely', () => {
    const summary = secretsGet.spec.redact?.result?.({ value: 'super-secret' });
    expect(summary).toEqual({ value: '<redacted>' });
  });

  test('SDK-side handler throws', () => {
    expect(() => secretsGet.handler(stubHandlerCtx, { key: 'a' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('secrets.set spec', () => {
  test('args + result schemas round-trip', () => {
    expect(SecretsSetArgsSchema.parse({ key: 'a', value: 'v' })).toEqual({ key: 'a', value: 'v' });
    expect(SecretsSetResultSchema.parse({})).toEqual({});
  });

  test('redact.args keeps key, hides value', () => {
    const summary = secretsSet.spec.redact?.args?.({ key: 'token', value: 'super-secret' });
    expect(summary).toEqual({ key: 'token', value: '<redacted>' });
  });

  test('rejects oversized value', () => {
    const tooBig = 'x'.repeat(64 * 1024 + 1);
    expect(() => SecretsSetArgsSchema.parse({ key: 'a', value: tooBig })).toThrow();
  });

  test('SDK-side handler throws', () => {
    expect(() => secretsSet.handler(stubHandlerCtx, { key: 'a', value: 'v' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('secrets.delete spec', () => {
  test('args + result schemas round-trip', () => {
    expect(SecretsDeleteArgsSchema.parse({ key: 'a' })).toEqual({ key: 'a' });
    expect(SecretsDeleteResultSchema.parse({ deleted: true })).toEqual({ deleted: true });
  });

  test('SDK-side handler throws', () => {
    expect(() => secretsDelete.handler(stubHandlerCtx, { key: 'a' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});
