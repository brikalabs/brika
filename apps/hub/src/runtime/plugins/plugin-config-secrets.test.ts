import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { get, provide, reset } from '@brika/di/testing';
import type { PreferenceDefinition } from '@brika/plugin';
import { type BunSecretsMock, installBunSecretsMock } from '@/helpers/_bun-secrets-mock';
import { ConfigLoader } from '@/runtime/config';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { StateStore } from '@/runtime/state/state-store';

const PLUGIN = '@brika/plugin-test';

/**
 * Light fakes for ConfigLoader and StateStore. These avoid spinning up real
 * SQLite/YAML and let us assert on the resulting YAML body.
 */
function fakeConfigLoader(initialConfig: Record<string, unknown> = {}) {
  const stored: Record<string, unknown> = { ...initialConfig };
  return {
    instance: {
      get(): {
        plugins: Array<{ name: string; version: string; config: Record<string, unknown> }>;
      } {
        return {
          plugins: [{ name: PLUGIN, version: '1.0.0', config: stored }],
        };
      },
      getPluginConfig(name: string): Record<string, unknown> | undefined {
        return name === PLUGIN ? stored : undefined;
      },
      async setPluginConfig(name: string, cfg: Record<string, unknown>): Promise<void> {
        if (name !== PLUGIN) {
          return;
        }
        for (const k of Object.keys(stored)) {
          delete stored[k];
        }
        Object.assign(stored, cfg);
      },
      async save(): Promise<void> {
        // no-op for these tests
      },
    } as unknown as ConfigLoader,
    stored,
  };
}

function fakeStateStore(prefs: PreferenceDefinition[]) {
  return {
    getMetadata(name: string) {
      return name === PLUGIN ? ({ preferences: prefs } as unknown) : undefined;
    },
  } as unknown as StateStore;
}

describe('PluginConfigService — secret routing', () => {
  let svc: PluginConfigService;
  let mock: BunSecretsMock;
  let configBacking: Record<string, unknown>;

  const schema: PreferenceDefinition[] = [
    { name: 'serverUrl', type: 'text', required: true },
    { name: 'apiKey', type: 'password', required: true },
    { name: 'optionalSecret', type: 'password' },
  ];

  beforeEach(() => {
    reset();
    mock = installBunSecretsMock();

    const cfg = fakeConfigLoader({ serverUrl: 'https://example.com' });
    configBacking = cfg.stored;

    provide(ConfigLoader, cfg.instance);
    provide(StateStore, fakeStateStore(schema));
    // Real SecretStore — uses the in-memory Bun.secrets mock.
    provide(SecretStore, new SecretStore());

    svc = get(PluginConfigService);
  });

  afterEach(() => {
    mock.restore();
    reset();
  });

  test('getConfig reads password values from the keychain, not from YAML', async () => {
    await get(SecretStore).set(PLUGIN, 'apiKey', 'sk-real');

    const resolved = await svc.getConfig(PLUGIN);

    expect(resolved.apiKey).toBe('sk-real');
    expect(resolved.serverUrl).toBe('https://example.com');
  });

  test('getConfig falls back to empty string when password is unset', async () => {
    const resolved = await svc.getConfig(PLUGIN);
    expect(resolved.apiKey).toBe('');
  });

  test('getConfigForApi masks set passwords and emits empty for unset', async () => {
    await get(SecretStore).set(PLUGIN, 'apiKey', 'sk-real');

    const masked = await svc.getConfigForApi(PLUGIN);

    expect(masked.apiKey).toBe('***');
    expect(masked.optionalSecret).toBe('');
    expect(masked.serverUrl).toBe('https://example.com');
  });

  test('getConfigForApi omits __secret_* keys from the response', async () => {
    configBacking.__secret_oauth_test_token = null;
    await get(SecretStore).setJSON(PLUGIN, '__secret_oauth_test_token', { access_token: 'at' });

    const masked = await svc.getConfigForApi(PLUGIN);

    expect(masked).not.toHaveProperty('__secret_oauth_test_token');
  });

  test('setConfig writes a new password to the keychain, not YAML', async () => {
    await svc.setConfig(PLUGIN, {
      serverUrl: 'https://example.com',
      apiKey: 'sk-new',
    });

    expect(await get(SecretStore).get(PLUGIN, 'apiKey')).toBe('sk-new');
    expect(configBacking).not.toHaveProperty('apiKey');
    expect(configBacking.serverUrl).toBe('https://example.com');
  });

  test('setConfig with the *** placeholder leaves the existing secret untouched', async () => {
    await get(SecretStore).set(PLUGIN, 'apiKey', 'sk-existing');

    await svc.setConfig(PLUGIN, {
      serverUrl: 'https://example.com',
      apiKey: '***',
    });

    expect(await get(SecretStore).get(PLUGIN, 'apiKey')).toBe('sk-existing');
  });

  test('setConfig with empty string deletes an optional secret from the keychain', async () => {
    await get(SecretStore).set(PLUGIN, 'optionalSecret', 'value');

    await svc.setConfig(PLUGIN, {
      serverUrl: 'https://example.com',
      apiKey: '***',
      optionalSecret: '',
    });

    expect(await get(SecretStore).get(PLUGIN, 'optionalSecret')).toBeNull();
  });

  test('setConfig persists __secret_* values to the keychain with a YAML sentinel', async () => {
    const token = { access_token: 'at', expires_at: 0, token_type: 'Bearer' };

    await svc.setConfig(PLUGIN, {
      serverUrl: 'https://example.com',
      apiKey: '***',
      __secret_oauth_test_token: token,
    });

    expect(
      await get(SecretStore).getJSON<typeof token>(PLUGIN, '__secret_oauth_test_token')
    ).toEqual(token);
    expect(configBacking.__secret_oauth_test_token).toBeNull();
  });

  test('getConfig resolves __secret_* values from the keychain on read', async () => {
    const token = { access_token: 'at', expires_at: 0, token_type: 'Bearer' };
    configBacking.__secret_oauth_test_token = null;
    await get(SecretStore).setJSON(PLUGIN, '__secret_oauth_test_token', token);

    const resolved = await svc.getConfig(PLUGIN);

    expect(resolved.__secret_oauth_test_token).toEqual(token);
  });

  test('getSecretKeysForPlugin returns password prefs and __secret_* keys', () => {
    configBacking.__secret_oauth_test_token = null;

    const keys = svc.getSecretKeysForPlugin(PLUGIN);

    expect(keys).toContain('apiKey');
    expect(keys).toContain('optionalSecret');
    expect(keys).toContain('__secret_oauth_test_token');
    expect(keys).not.toContain('serverUrl');
  });

  test('getConfig absorbs a hand-written plaintext password into the keychain and scrubs YAML', async () => {
    // An operator typed the secret straight into brika.yml.
    configBacking.apiKey = 'sk-handwritten';

    const resolved = await svc.getConfig(PLUGIN);

    // Resolved config still carries the value (read back from the keychain)…
    expect(resolved.apiKey).toBe('sk-handwritten');
    // …the keychain now holds it…
    expect(await get(SecretStore).get(PLUGIN, 'apiKey')).toBe('sk-handwritten');
    // …and the plaintext is gone from the on-disk config.
    expect(configBacking).not.toHaveProperty('apiKey');
  });

  test('getConfig absorbs a hand-written __secret_* value and leaves a null marker', async () => {
    const token = { access_token: 'handwritten', expires_at: 0, token_type: 'Bearer' };
    configBacking.__secret_oauth_test_token = token;

    const resolved = await svc.getConfig(PLUGIN);

    expect(resolved.__secret_oauth_test_token).toEqual(token);
    expect(
      await get(SecretStore).getJSON<typeof token>(PLUGIN, '__secret_oauth_test_token')
    ).toEqual(token);
    expect(configBacking.__secret_oauth_test_token).toBeNull();
  });

  test('ingestion is idempotent — a second getConfig does not rewrite an already-scrubbed config', async () => {
    configBacking.apiKey = 'sk-handwritten';
    await svc.getConfig(PLUGIN);
    expect(configBacking).not.toHaveProperty('apiKey');

    // A `null` marker / absent plaintext must not trigger another keychain write.
    const before = await get(SecretStore).get(PLUGIN, 'apiKey');
    await get(SecretStore).set(PLUGIN, 'apiKey', 'sk-rotated');
    await svc.getConfig(PLUGIN);
    // The second pass found no plaintext, so it left the keychain value alone.
    expect(await get(SecretStore).get(PLUGIN, 'apiKey')).toBe('sk-rotated');
    expect(before).toBe('sk-handwritten');
  });

  test('a *** placeholder accidentally left in YAML is dropped, not stored', async () => {
    await get(SecretStore).set(PLUGIN, 'apiKey', 'sk-existing');
    configBacking.apiKey = '***';

    const resolved = await svc.getConfig(PLUGIN);

    expect(configBacking).not.toHaveProperty('apiKey');
    expect(await get(SecretStore).get(PLUGIN, 'apiKey')).toBe('sk-existing');
    expect(resolved.apiKey).toBe('sk-existing');
  });
});
