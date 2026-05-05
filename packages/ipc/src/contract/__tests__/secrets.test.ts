/**
 * Plugin secrets contract — schema validation tests
 *
 * The hub trusts these schemas to gate inputs at the IPC boundary, so the
 * key shape is part of the security contract. Anything that lets `..` or
 * a control character through here would let a plugin influence the
 * Bun.secrets `name` field outside its assigned namespace.
 */

import { describe, expect, test } from 'bun:test';
import { deletePluginSecret, getPluginSecret, SecretKey, setPluginSecret } from '../secrets';

describe('SecretKey schema', () => {
  test('accepts plain alphanumeric keys', () => {
    expect(SecretKey.safeParse('apiKey').success).toBe(true);
    expect(SecretKey.safeParse('a').success).toBe(true);
    expect(SecretKey.safeParse('cache_token').success).toBe(true);
    expect(SecretKey.safeParse('cache.token').success).toBe(true);
    expect(SecretKey.safeParse('cache-token').success).toBe(true);
  });

  test('rejects empty strings', () => {
    expect(SecretKey.safeParse('').success).toBe(false);
  });

  test('rejects keys that do not start with a letter', () => {
    expect(SecretKey.safeParse('1apikey').success).toBe(false);
    expect(SecretKey.safeParse('_private').success).toBe(false);
    expect(SecretKey.safeParse('-flag').success).toBe(false);
    expect(SecretKey.safeParse('.hidden').success).toBe(false);
  });

  test('rejects path-traversal sequences', () => {
    expect(SecretKey.safeParse('a..b').success).toBe(false);
    expect(SecretKey.safeParse('foo..').success).toBe(false);
  });

  test('rejects control and structural characters', () => {
    expect(SecretKey.safeParse('a/b').success).toBe(false);
    expect(SecretKey.safeParse('a:b').success).toBe(false);
    expect(SecretKey.safeParse('a b').success).toBe(false);
    expect(SecretKey.safeParse('a\nb').success).toBe(false);
    expect(SecretKey.safeParse('a\x00b').success).toBe(false);
    expect(SecretKey.safeParse(String.raw`a\b`).success).toBe(false);
  });

  test('rejects keys exceeding the length cap', () => {
    expect(SecretKey.safeParse(`a${'b'.repeat(127)}`).success).toBe(true);
    expect(SecretKey.safeParse(`a${'b'.repeat(128)}`).success).toBe(false);
  });

  test('rejects unicode whitespace and homoglyphs that look like ASCII letters', () => {
    // Cyrillic small letter 'а' (U+0430) — visually identical to Latin 'a'
    expect(SecretKey.safeParse('аpiKey').success).toBe(false);
    // Zero-width space at start
    expect(SecretKey.safeParse('​apiKey').success).toBe(false);
    // RTL override
    expect(SecretKey.safeParse('‮apiKey').success).toBe(false);
    // Tab and newline
    expect(SecretKey.safeParse('a\tb').success).toBe(false);
    expect(SecretKey.safeParse('a\rb').success).toBe(false);
  });

  test('rejects shell-meaningful and quoting characters', () => {
    expect(SecretKey.safeParse('a"b').success).toBe(false);
    expect(SecretKey.safeParse("a'b").success).toBe(false);
    expect(SecretKey.safeParse('a;b').success).toBe(false);
    expect(SecretKey.safeParse('a|b').success).toBe(false);
    expect(SecretKey.safeParse('a$b').success).toBe(false);
    expect(SecretKey.safeParse('a`b').success).toBe(false);
  });
});

describe('getPluginSecret schema', () => {
  test('rejects unknown fields like a smuggled pluginName', () => {
    // Zod object schemas are strict by default — anything extra is dropped.
    // The hub never observes a `pluginName` on the wire; identity comes from
    // the trusted IPC channel.
    const parsed = getPluginSecret.input.parse({
      key: 'apiKey',
      pluginName: '@victim/plugin',
    } as unknown as { key: string });
    expect(parsed).toEqual({ key: 'apiKey' });
    expect((parsed as { pluginName?: unknown }).pluginName).toBeUndefined();
  });

  test('rejects non-string keys', () => {
    expect(getPluginSecret.input.safeParse({ key: 123 }).success).toBe(false);
    expect(getPluginSecret.input.safeParse({ key: null }).success).toBe(false);
    expect(getPluginSecret.input.safeParse({ key: { toString: () => 'x' } }).success).toBe(false);
  });

  test('rejects missing key', () => {
    expect(getPluginSecret.input.safeParse({}).success).toBe(false);
  });
});

describe('setPluginSecret schema', () => {
  test('caps values at 64 KiB to prevent keychain DoS', () => {
    const just_under = 'x'.repeat(64 * 1024);
    expect(setPluginSecret.input.safeParse({ key: 'apiKey', value: just_under }).success).toBe(
      true
    );

    const over = 'x'.repeat(64 * 1024 + 1);
    expect(setPluginSecret.input.safeParse({ key: 'apiKey', value: over }).success).toBe(false);
  });

  test('accepts an empty string (signals delete)', () => {
    expect(setPluginSecret.input.safeParse({ key: 'apiKey', value: '' }).success).toBe(true);
  });

  test('rejects non-string values', () => {
    expect(setPluginSecret.input.safeParse({ key: 'apiKey', value: 123 }).success).toBe(false);
    expect(setPluginSecret.input.safeParse({ key: 'apiKey', value: { secret: 'x' } }).success).toBe(
      false
    );
    expect(setPluginSecret.input.safeParse({ key: 'apiKey', value: null }).success).toBe(false);
  });

  test('rejects unknown fields like a smuggled pluginName', () => {
    const parsed = setPluginSecret.input.parse({
      key: 'apiKey',
      value: 'sk',
      pluginName: '@victim/plugin',
    } as unknown as { key: string; value: string });
    expect(parsed).toEqual({ key: 'apiKey', value: 'sk' });
  });
});

describe('deletePluginSecret schema', () => {
  test('accepts a valid key', () => {
    expect(deletePluginSecret.input.safeParse({ key: 'apiKey' }).success).toBe(true);
  });

  test('rejects path-traversal in the key', () => {
    expect(deletePluginSecret.input.safeParse({ key: '..' }).success).toBe(false);
    expect(deletePluginSecret.input.safeParse({ key: 'a..b' }).success).toBe(false);
  });

  test('rejects unknown fields', () => {
    const parsed = deletePluginSecret.input.parse({
      key: 'apiKey',
      pluginName: '@victim/plugin',
    } as unknown as { key: string });
    expect(parsed).toEqual({ key: 'apiKey' });
  });
});
