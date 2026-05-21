import { describe, expect, test } from 'bun:test';
import { filterPluginEnv } from '@/runtime/config/plugin-env';

describe('filterPluginEnv', () => {
  test('passes through essential vars', () => {
    const out = filterPluginEnv({
      PATH: '/usr/bin',
      HOME: '/home/u',
      USER: 'u',
      LANG: 'en_US.UTF-8',
      TZ: 'UTC',
      SHELL: '/bin/zsh',
      NODE_ENV: 'production',
    });
    expect(out).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/u',
      USER: 'u',
      LANG: 'en_US.UTF-8',
      TZ: 'UTC',
      SHELL: '/bin/zsh',
      NODE_ENV: 'production',
    });
  });

  test('passes through BRIKA_PLUGIN_* and BRIKA_SECRETS_* prefixes', () => {
    const out = filterPluginEnv({
      BRIKA_PLUGIN_NAME: 'weather',
      BRIKA_PLUGIN_UID: 'uid-123',
      BRIKA_SECRETS_BACKEND: 'keychain',
      OTHER: 'nope',
    });
    expect(out.BRIKA_PLUGIN_NAME).toBe('weather');
    expect(out.BRIKA_PLUGIN_UID).toBe('uid-123');
    expect(out.BRIKA_SECRETS_BACKEND).toBe('keychain');
    expect(out.OTHER).toBeUndefined();
  });

  test('strips operator secrets (GITHUB_TOKEN, AWS_*, DATABASE_URL, OPENAI_API_KEY, etc.)', () => {
    const out = filterPluginEnv({
      PATH: '/usr/bin',
      GITHUB_TOKEN: 'ghp_xxx',
      AWS_ACCESS_KEY_ID: 'AKIA...',
      AWS_SECRET_ACCESS_KEY: 'secret',
      DATABASE_URL: 'postgres://u:p@h/db',
      OPENAI_API_KEY: 'sk-...',
      ANTHROPIC_API_KEY: 'sk-ant-...',
      NPM_TOKEN: 'npm_xxx',
    });
    expect(Object.keys(out)).toEqual(['PATH']);
    expect(out.GITHUB_TOKEN).toBeUndefined();
    expect(out.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(out.DATABASE_URL).toBeUndefined();
    expect(out.OPENAI_API_KEY).toBeUndefined();
  });

  test('BRIKA_PLUGIN_ENV_PASSTHROUGH=1 disables filtering (debug escape hatch)', () => {
    const out = filterPluginEnv({
      BRIKA_PLUGIN_ENV_PASSTHROUGH: '1',
      GITHUB_TOKEN: 'ghp_xxx',
      RANDOM: 'value',
    });
    expect(out.GITHUB_TOKEN).toBe('ghp_xxx');
    expect(out.RANDOM).toBe('value');
  });

  test('preserves undefined values for allowlisted keys', () => {
    const out = filterPluginEnv({
      PATH: '/usr/bin',
      TZ: undefined,
    });
    expect(out.PATH).toBe('/usr/bin');
    expect('TZ' in out).toBe(true);
    expect(out.TZ).toBeUndefined();
  });

  test('does not match prefixes inside the middle of a key', () => {
    const out = filterPluginEnv({
      X_BRIKA_PLUGIN_NAME: 'should-not-pass',
    });
    expect(out.X_BRIKA_PLUGIN_NAME).toBeUndefined();
  });
});
