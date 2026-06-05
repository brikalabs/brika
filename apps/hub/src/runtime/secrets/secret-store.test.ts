import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { get, reset } from '@brika/di/testing';
import { type BunSecretsMock, installBunSecretsMock } from '@/helpers/_bun-secrets-mock';
import { brikaContext } from '@/runtime/context/brika-context';
import { SecretStore } from '@/runtime/secrets/secret-store';

const SERVICE = brikaContext.serviceName;

describe('SecretStore', () => {
  let store: SecretStore;
  let mock: BunSecretsMock;

  beforeEach(() => {
    reset();
    mock = installBunSecretsMock();
    store = get(SecretStore);
  });

  afterEach(() => {
    mock.restore();
    reset();
  });

  test('round-trips a string secret scoped by plugin name', async () => {
    await store.set('@brika/plugin-a', 'apiKey', 'sk-abc');
    expect(await store.get('@brika/plugin-a', 'apiKey')).toBe('sk-abc');
  });

  test('returns null when the secret is missing', async () => {
    expect(await store.get('@brika/plugin-a', 'missing')).toBeNull();
  });

  test('isolates secrets across plugins with the same key name', async () => {
    await store.set('@brika/plugin-a', 'apiKey', 'value-a');
    await store.set('@brika/plugin-b', 'apiKey', 'value-b');
    expect(await store.get('@brika/plugin-a', 'apiKey')).toBe('value-a');
    expect(await store.get('@brika/plugin-b', 'apiKey')).toBe('value-b');
  });

  test('overwrites on repeat set', async () => {
    await store.set('@brika/plugin-a', 'apiKey', 'first');
    await store.set('@brika/plugin-a', 'apiKey', 'second');
    expect(await store.get('@brika/plugin-a', 'apiKey')).toBe('second');
  });

  test('delete removes the secret and returns true if it existed', async () => {
    await store.set('@brika/plugin-a', 'apiKey', 'value');
    expect(await store.delete('@brika/plugin-a', 'apiKey')).toBe(true);
    expect(await store.get('@brika/plugin-a', 'apiKey')).toBeNull();
  });

  test('delete returns false when the secret did not exist', async () => {
    expect(await store.delete('@brika/plugin-a', 'missing')).toBe(false);
  });

  test('round-trips JSON values', async () => {
    const token = {
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: 123,
      token_type: 'Bearer',
    };
    await store.setJSON('@brika/plugin-a', '__secret_oauth_test_token', token);
    expect(
      await store.getJSON<typeof token>('@brika/plugin-a', '__secret_oauth_test_token')
    ).toEqual(token);
  });

  test('getJSON returns null when underlying value is malformed', async () => {
    await store.set('@brika/plugin-a', 'broken', 'not json{');
    expect(await store.getJSON('@brika/plugin-a', 'broken')).toBeNull();
  });

  test('getJSON returns null when secret is missing', async () => {
    expect(await store.getJSON('@brika/plugin-a', 'missing')).toBeNull();
  });

  test('deleteAllForPlugin removes every listed key for that plugin', async () => {
    await store.set('@brika/plugin-a', 'one', '1');
    await store.set('@brika/plugin-a', 'two', '2');
    await store.set('@brika/plugin-b', 'one', 'kept');

    await store.deleteAllForPlugin('@brika/plugin-a', ['one', 'two']);

    expect(await store.get('@brika/plugin-a', 'one')).toBeNull();
    expect(await store.get('@brika/plugin-a', 'two')).toBeNull();
    expect(await store.get('@brika/plugin-b', 'one')).toBe('kept');
  });

  test('keychain entries are namespaced under the per-instance service', async () => {
    await store.set('@brika/plugin-a', 'apiKey', 'value');
    expect(mock.store.has(`${SERVICE}::@brika/plugin-a::apiKey`)).toBe(true);
  });

  // ─── Namespace boundary (security) ────────────────────────────────────────

  describe('namespace boundary', () => {
    // The SecretStore uses `${pluginName}::${key}` qualification. The hub layers
    // higher-level subspaces on top: declared password prefs use the bare key,
    // OAuth tokens use the `__secret_*` key, and SDK programmatic secrets use
    // a `user.*` key (enforced in PluginLifecycle). These tests pin the wire
    // format so refactors that would let one subspace bleed into another break
    // here loudly.

    test('the wire format is exactly service::pluginName::key', async () => {
      await store.set('@plugin-a', 'a-key', 'a-value');
      const keys = [...mock.store.keys()];
      expect(keys).toEqual([`${SERVICE}::@plugin-a::a-key`]);
    });

    test('declared password pref and SDK user-secret with same name occupy different slots', async () => {
      // What PluginConfigService writes for a `password`-typed pref:
      await store.set('@plugin', 'apiKey', 'pref-value');
      // What PluginLifecycle writes for a programmatic secret named `apiKey`:
      await store.set('@plugin', 'user.apiKey', 'sdk-value');

      // They don't collide.
      expect(await store.get('@plugin', 'apiKey')).toBe('pref-value');
      expect(await store.get('@plugin', 'user.apiKey')).toBe('sdk-value');
      // And both rows physically exist in the keychain.
      expect(mock.store.size).toBe(2);
    });

    test('a key cannot reach another plugin via crafted separators', async () => {
      // The qualification is positional, not parsed — `::` inside the key is
      // just literal text, not a delimiter that could pivot to another plugin.
      await store.set('@plugin-a', 'b::stolen', 'attacker-secret');
      await store.set('@plugin-b', 'stolen', 'victim-secret');

      // No cross-talk: each call resolves to its own row.
      expect(await store.get('@plugin-a', 'b::stolen')).toBe('attacker-secret');
      expect(await store.get('@plugin-b', 'stolen')).toBe('victim-secret');
      // The two qualified names are distinct keys in the keychain.
      expect(mock.store.has(`${SERVICE}::@plugin-a::b::stolen`)).toBe(true);
      expect(mock.store.has(`${SERVICE}::@plugin-b::stolen`)).toBe(true);
    });

    test('deleteAllForPlugin only removes the listed keys for the named plugin', async () => {
      await store.set('@plugin-a', 'pref', 'a-pref');
      await store.set('@plugin-a', 'user.token', 'a-user');
      await store.set('@plugin-a', 'untouched', 'survives');
      await store.set('@plugin-b', 'pref', 'b-pref');

      await store.deleteAllForPlugin('@plugin-a', ['pref', 'user.token']);

      expect(await store.get('@plugin-a', 'pref')).toBeNull();
      expect(await store.get('@plugin-a', 'user.token')).toBeNull();
      // Keys not in the deletion list are kept.
      expect(await store.get('@plugin-a', 'untouched')).toBe('survives');
      // Other plugins are never touched.
      expect(await store.get('@plugin-b', 'pref')).toBe('b-pref');
    });

    test('setting an existing secret does not leak the previous value via partial overwrite', async () => {
      await store.set('@plugin', 'token', 'first-secret-very-long-value');
      await store.set('@plugin', 'token', 'short');

      expect(await store.get('@plugin', 'token')).toBe('short');
      // Only one row; the old value is fully replaced (not appended).
      expect(mock.store.size).toBe(1);
    });

    test('delete removes the underlying keychain entry, not just our view', async () => {
      await store.set('@plugin', 'token', 'value');
      expect(mock.store.size).toBe(1);

      await store.delete('@plugin', 'token');
      expect(mock.store.size).toBe(0);
    });
  });
});
