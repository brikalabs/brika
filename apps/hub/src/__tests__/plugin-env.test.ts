/**
 * Tests for filterPluginEnv — the allowlist that gates which host env vars
 * are exposed to spawned plugin processes (security fix S1).
 */

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import {
  filterPluginEnv,
  PLUGIN_ENV_PASSTHROUGH_VAR,
  parsePluginEnvPassthrough,
} from '@/runtime/config/plugin-env';

describe('filterPluginEnv', () => {
  test('passes shell basics through (PATH, HOME, USER, LANG, LC_ALL, TZ, SHELL)', () => {
    const filtered = filterPluginEnv({
      PATH: '/usr/bin',
      HOME: '/home/op',
      USER: 'op',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'C',
      TZ: 'UTC',
      SHELL: '/bin/zsh',
    });
    expect(filtered.PATH).toBe('/usr/bin');
    expect(filtered.HOME).toBe('/home/op');
    expect(filtered.USER).toBe('op');
    expect(filtered.LANG).toBe('en_US.UTF-8');
    expect(filtered.LC_ALL).toBe('C');
    expect(filtered.TZ).toBe('UTC');
    expect(filtered.SHELL).toBe('/bin/zsh');
  });

  test('passes NODE_ENV and BUN_BE_BUN through', () => {
    const filtered = filterPluginEnv({
      NODE_ENV: 'production',
      BUN_BE_BUN: '1',
    });
    expect(filtered.NODE_ENV).toBe('production');
    expect(filtered.BUN_BE_BUN).toBe('1');
  });

  test('blocks sensitive host secrets by default (GITHUB_TOKEN, AWS_SECRET_ACCESS_KEY, DATABASE_URL)', () => {
    const filtered = filterPluginEnv({
      PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghp_secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      DATABASE_URL: 'postgres://user:pw@host/db',
      OPENAI_API_KEY: 'sk-...',
    });
    expect(filtered).not.toHaveProperty('GITHUB_TOKEN');
    expect(filtered).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(filtered).not.toHaveProperty('AWS_ACCESS_KEY_ID');
    expect(filtered).not.toHaveProperty('DATABASE_URL');
    expect(filtered).not.toHaveProperty('OPENAI_API_KEY');
    // sanity: PATH still made it through
    expect(filtered.PATH).toBe('/usr/bin');
  });

  test('passes BRIKA_PLUGIN_* through (operator-scoped plugin config)', () => {
    const filtered = filterPluginEnv({
      BRIKA_PLUGIN_FOO: 'foo-value',
      BRIKA_PLUGIN_BAR_BAZ: 'bar-value',
    });
    expect(filtered.BRIKA_PLUGIN_FOO).toBe('foo-value');
    expect(filtered.BRIKA_PLUGIN_BAR_BAZ).toBe('bar-value');
  });

  test('passes BRIKA_SECRETS_* through (secret backend selector)', () => {
    const filtered = filterPluginEnv({
      BRIKA_SECRETS_BACKEND: 'keychain',
      BRIKA_SECRETS_FILE_PATH: '/var/lib/brika/secrets',
    });
    expect(filtered.BRIKA_SECRETS_BACKEND).toBe('keychain');
    expect(filtered.BRIKA_SECRETS_FILE_PATH).toBe('/var/lib/brika/secrets');
  });

  test('honors BRIKA_PLUGIN_ENV_PASSTHROUGH=FOO,BAR opt-in', () => {
    const filtered = filterPluginEnv({
      BRIKA_PLUGIN_ENV_PASSTHROUGH: 'FOO,BAR',
      FOO: 'foo-value',
      BAR: 'bar-value',
      BAZ: 'baz-should-not-pass',
    });
    expect(filtered.FOO).toBe('foo-value');
    expect(filtered.BAR).toBe('bar-value');
    expect(filtered).not.toHaveProperty('BAZ');
  });

  test('tolerates whitespace and empty entries in passthrough list', () => {
    const filtered = filterPluginEnv({
      BRIKA_PLUGIN_ENV_PASSTHROUGH: ' FOO , , BAR ',
      FOO: '1',
      BAR: '2',
    });
    expect(filtered.FOO).toBe('1');
    expect(filtered.BAR).toBe('2');
  });

  test('drops undefined values', () => {
    const filtered = filterPluginEnv({
      PATH: '/usr/bin',
      HOME: undefined,
    });
    expect(filtered.PATH).toBe('/usr/bin');
    expect(filtered).not.toHaveProperty('HOME');
  });

  test('does not pass non-prefixed BRIKA vars through', () => {
    // Defensive: only the BRIKA_PLUGIN_* and BRIKA_SECRETS_* prefixes are
    // safe. Generic BRIKA_* (e.g. BRIKA_BUN_PATH for the hub bin override)
    // is hub-internal and must not bleed into plugin processes.
    const filtered = filterPluginEnv({
      BRIKA_BUN_PATH: '/opt/bun',
      BRIKA_INTERNAL_TOKEN: 'secret',
    });
    expect(filtered).not.toHaveProperty('BRIKA_BUN_PATH');
    expect(filtered).not.toHaveProperty('BRIKA_INTERNAL_TOKEN');
  });

  test('returns an empty object for an empty source', () => {
    expect(filterPluginEnv({})).toEqual({});
  });
});

describe('parsePluginEnvPassthrough', () => {
  test('returns empty list when env var is unset', () => {
    expect(parsePluginEnvPassthrough({})).toEqual([]);
  });

  test('returns empty list when env var is empty string', () => {
    expect(parsePluginEnvPassthrough({ [PLUGIN_ENV_PASSTHROUGH_VAR]: '' })).toEqual([]);
  });

  test('parses comma-separated names with whitespace trimmed', () => {
    const names = parsePluginEnvPassthrough({
      [PLUGIN_ENV_PASSTHROUGH_VAR]: 'FOO, BAR ,  BAZ',
    });
    expect(names).toEqual(['FOO', 'BAR', 'BAZ']);
  });

  test('de-duplicates while preserving order', () => {
    const names = parsePluginEnvPassthrough({
      [PLUGIN_ENV_PASSTHROUGH_VAR]: 'FOO,BAR,FOO',
    });
    expect(names).toEqual(['FOO', 'BAR']);
  });
});
