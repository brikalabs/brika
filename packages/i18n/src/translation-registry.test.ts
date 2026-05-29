import { describe, expect, mock, test } from 'bun:test';
import { TranslationRegistry } from './translation-registry';

describe('TranslationRegistry — basic CRUD', () => {
  test('set + getNamespaceTranslations returns stored data with fallback', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });
    reg.setNamespaceLocale('common', 'fr', { hello: 'Bonjour' }, { merge: true });

    expect(reg.getNamespaceTranslations('en', 'common')).toEqual({ hello: 'Hello' });
    expect(reg.getNamespaceTranslations('fr', 'common')).toEqual({ hello: 'Bonjour' });
  });

  test('regional locale falls back to base then en', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: 'en-a', b: 'en-b', c: 'en-c' }, { merge: true });
    reg.setNamespaceLocale('common', 'fr', { a: 'fr-a', b: 'fr-b' }, { merge: true });

    expect(reg.getNamespaceTranslations('fr-CH', 'common')).toEqual({
      a: 'fr-a',
      b: 'fr-b',
      c: 'en-c',
    });
  });

  test('merge:true deep-merges across same-locale writes', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { ui: { title: 'A' } }, { merge: true });
    reg.setNamespaceLocale('common', 'en', { ui: { subtitle: 'B' } }, { merge: true });

    expect(reg.getNamespaceTranslations('en', 'common')).toEqual({
      ui: { title: 'A', subtitle: 'B' },
    });
  });

  test('merge:false replaces previous data for the same locale', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('plugin:foo', 'en', { v1: 'A' }, { merge: false });
    reg.setNamespaceLocale('plugin:foo', 'en', { v2: 'B' }, { merge: false });

    expect(reg.getNamespaceTranslations('en', 'plugin:foo')).toEqual({ v2: 'B' });
  });

  test('removeNamespace drops the entry', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('foo', 'en', { hi: 'hi' }, { merge: true });

    expect(reg.removeNamespace('foo')).toBe(true);
    expect(reg.getNamespaceTranslations('en', 'foo')).toBeNull();
    expect(reg.removeNamespace('foo')).toBe(false);
  });
});

describe('TranslationRegistry — bulk access', () => {
  test('getAllTranslations returns every registered namespace', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { hi: 'hi' }, { merge: true });
    reg.setNamespaceLocale('permissions', 'en', { title: 'P' }, { merge: true });

    expect(reg.getAllTranslations('en')).toEqual({
      common: { hi: 'hi' },
      permissions: { title: 'P' },
    });
  });

  test('listNamespaces is sorted', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('zeta', 'en', { a: '1' }, { merge: true });
    reg.setNamespaceLocale('alpha', 'en', { a: '1' }, { merge: true });
    reg.setNamespaceLocale('beta', 'en', { a: '1' }, { merge: true });

    expect(reg.listNamespaces()).toEqual(['alpha', 'beta', 'zeta']);
  });

  test('listLocales is sorted and only includes contributing locales', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
    reg.setNamespaceLocale('a', 'fr', { x: '1' }, { merge: true });
    reg.setNamespaceLocale('b', 'de', { y: '1' }, { merge: true });

    expect(reg.listLocales()).toEqual(['de', 'en', 'fr']);
  });
});

describe('TranslationRegistry — clear()', () => {
  test('drops namespaces matching predicate, keeps others', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true, source: 'hub' });
    reg.setNamespaceLocale('permissions', 'en', { a: '1' }, { merge: true, source: 'package' });
    reg.setNamespaceLocale('plugin:x', 'en', { a: '1' }, { merge: true, source: 'plugin' });

    reg.clear((source) => source !== 'plugin');

    expect(reg.listNamespaces()).toEqual(['plugin:x']);
  });

  test('rebuilds availableLocales after clearing', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true, source: 'hub' });
    reg.setNamespaceLocale('plugin:x', 'fr', { a: '1' }, { merge: true, source: 'plugin' });

    reg.clear((source) => source === 'hub');

    expect(reg.listLocales()).toEqual(['fr']);
  });
});

describe('TranslationRegistry — collision detection', () => {
  test('fires onCollision when a namespace is claimed by a second source', () => {
    const reg = new TranslationRegistry();
    const onCollision = mock();
    reg.onCollision = onCollision;

    reg.setNamespaceLocale('foo', 'en', {}, { merge: true, source: 'hub' });
    reg.setNamespaceLocale('foo', 'en', {}, { merge: true, source: 'package' });

    expect(onCollision).toHaveBeenCalledTimes(1);
    expect(onCollision).toHaveBeenCalledWith({
      namespace: 'foo',
      existingSource: 'hub',
      incomingSource: 'package',
    });
  });

  test('same source on same namespace does not collide', () => {
    const reg = new TranslationRegistry();
    const onCollision = mock();
    reg.onCollision = onCollision;

    reg.setNamespaceLocale('foo', 'en', {}, { merge: true, source: 'hub' });
    reg.setNamespaceLocale('foo', 'fr', {}, { merge: true, source: 'hub' });

    expect(onCollision).not.toHaveBeenCalled();
  });
});

describe('TranslationRegistry — cache invalidation', () => {
  test('returns updated data after a set following a read', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true });
    // First read populates the cache.
    reg.getAllTranslations('en');

    reg.setNamespaceLocale('common', 'en', { b: '2' }, { merge: true });

    expect(reg.getAllTranslations('en')).toEqual({ common: { a: '1', b: '2' } });
  });

  test('removeNamespace invalidates the cache', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true });
    reg.getAllTranslations('en');

    reg.removeNamespace('common');

    expect(reg.getAllTranslations('en')).toEqual({});
  });
});

describe('TranslationRegistry — change notifications', () => {
  test('onChange fires for set/remove/clear events', () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    reg.onChange(listener);

    reg.setNamespaceLocale('foo', 'en', { a: '1' }, { merge: true, source: 'hub' });
    reg.removeNamespace('foo');
    reg.setNamespaceLocale('bar', 'en', { a: '1' }, { merge: true, source: 'plugin' });
    reg.clear((source) => source === 'plugin');

    expect(listener).toHaveBeenCalledTimes(4);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ kind: 'set', namespace: 'foo' });
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ kind: 'remove', namespace: 'foo' });
    expect(listener.mock.calls[3]?.[0]).toMatchObject({ kind: 'clear', namespace: null });
  });

  test('unsubscribe returned by onChange stops further notifications', () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    const unsubscribe = reg.onChange(listener);

    reg.setNamespaceLocale('foo', 'en', { a: '1' }, { merge: true });
    unsubscribe();
    reg.setNamespaceLocale('foo', 'fr', { a: '1' }, { merge: true });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('listener exception does not affect other listeners or caller', () => {
    const reg = new TranslationRegistry();
    const failing = mock(() => {
      throw new Error('boom');
    });
    const succeeding = mock();
    reg.onChange(failing);
    reg.onChange(succeeding);

    expect(() => reg.setNamespaceLocale('foo', 'en', {}, { merge: true })).not.toThrow();
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});

describe('TranslationRegistry — stats', () => {
  test('reports namespace and locale counts', () => {
    const reg = new TranslationRegistry();
    expect(reg.getStats()).toEqual({ namespaces: 0, locales: 0 });

    reg.setNamespaceLocale('a', 'en', {}, { merge: true });
    reg.setNamespaceLocale('b', 'fr', {}, { merge: true });

    expect(reg.getStats()).toEqual({ namespaces: 2, locales: 2 });
  });
});

describe('TranslationRegistry — removeNamespaceLocale', () => {
  test('drops a single locale entry without affecting the rest of the namespace', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { en: '1' }, { merge: true });
    reg.setNamespaceLocale('common', 'fr', { fr: '1' }, { merge: true });

    expect(reg.removeNamespaceLocale('common', 'fr')).toBe(true);
    expect(reg.getNamespaceTranslations('en', 'common')).toEqual({ en: '1' });
    // `fr` falls through to `en` via the fallback chain — the `fr-only` key
    // is gone, but `en` strings are still served under the `fr` locale.
    expect(reg.getNamespaceTranslations('fr', 'common')).toEqual({ en: '1' });
  });

  test('drops the namespace itself when the last locale is removed', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true, source: 'hub' });

    expect(reg.removeNamespaceLocale('common', 'en')).toBe(true);
    expect(reg.listNamespaces()).toEqual([]);
    // After namespace removal, re-adding with a different source must not
    // trip collision detection — the source tag was dropped.
    const onCollision = mock();
    reg.onCollision = onCollision;
    reg.setNamespaceLocale('common', 'en', { b: '2' }, { merge: true, source: 'package' });
    expect(onCollision).not.toHaveBeenCalled();
  });

  test('returns false for a missing namespace', () => {
    const reg = new TranslationRegistry();
    expect(reg.removeNamespaceLocale('missing', 'en')).toBe(false);
  });

  test('returns false for an existing namespace that lacks the requested locale', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true });
    expect(reg.removeNamespaceLocale('common', 'fr')).toBe(false);
  });

  test('rebuilds availableLocales after dropping a locale', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true });
    reg.setNamespaceLocale('common', 'fr', { a: '1' }, { merge: true });

    expect(reg.listLocales()).toEqual(['en', 'fr']);
    reg.removeNamespaceLocale('common', 'fr');
    expect(reg.listLocales()).toEqual(['en']);
  });

  test('fires a set-shaped change event for the locale drop', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { a: '1' }, { merge: true });
    const listener = mock();
    reg.onChange(listener);

    reg.removeNamespaceLocale('common', 'en');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      kind: 'set',
      namespace: 'common',
      locale: 'en',
    });
  });
});

describe('TranslationRegistry — transaction', () => {
  test('buffers change events until the outermost transaction commits', () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    reg.onChange(listener);

    reg.transaction(() => {
      reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
      reg.setNamespaceLocale('b', 'en', { y: '2' }, { merge: true });
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('returns the synchronous callback result', () => {
    const reg = new TranslationRegistry();
    const result = reg.transaction(() => 42);
    expect(result).toBe(42);
  });

  test('awaits async callbacks and commits once the promise settles', async () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    reg.onChange(listener);

    const work = async (): Promise<string> => {
      reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
      await Promise.resolve();
      reg.setNamespaceLocale('b', 'en', { y: '2' }, { merge: true });
      return 'ok';
    };
    const pending: Promise<string> = reg.transaction(work);
    const result = await pending;

    expect(result).toBe('ok');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('clears the resolved-locale cache only once across many mutations', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
    // Prime the cache.
    reg.getAllTranslations('en');

    reg.transaction(() => {
      reg.setNamespaceLocale('a', 'en', { x: '2' }, { merge: false });
      reg.setNamespaceLocale('b', 'en', { y: '1' }, { merge: true });
    });

    // After commit the cache is stale — the next read sees the new data.
    expect(reg.getAllTranslations('en')).toEqual({
      a: { x: '2' },
      b: { y: '1' },
    });
  });

  test('nested transactions only commit at the outermost level', () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    reg.onChange(listener);

    reg.transaction(() => {
      reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
      reg.transaction(() => {
        reg.setNamespaceLocale('b', 'en', { y: '2' }, { merge: true });
        expect(listener).not.toHaveBeenCalled();
      });
      // Inner commit didn't flush — still buffered until the outer commit.
      expect(listener).not.toHaveBeenCalled();
    });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('synchronous callback exceptions still commit (and rethrow)', () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    reg.onChange(listener);

    expect(() =>
      reg.transaction(() => {
        reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
        throw new Error('boom');
      })
    ).toThrow('boom');

    // The mutation that ran before the throw still flushes — caller observed
    // it and the listener must see the matching event.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('async-callback rejection commits buffered events via finally', async () => {
    const reg = new TranslationRegistry();
    const listener = mock();
    reg.onChange(listener);

    const work = async (): Promise<void> => {
      reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
      await Promise.resolve();
      throw new Error('boom');
    };
    const pending: Promise<void> = reg.transaction(work);
    await expect(pending).rejects.toThrow('boom');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('empty transaction is a no-op (no listener fire, no cache clear)', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('a', 'en', { x: '1' }, { merge: true });
    reg.getAllTranslations('en');
    const listener = mock();
    reg.onChange(listener);

    reg.transaction(() => undefined);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('TranslationRegistry — getBundleJson', () => {
  test('returns a stable etag and JSON body for a locale', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });

    const a = reg.getBundleJson('en');
    const b = reg.getBundleJson('en');

    expect(JSON.parse(a.body)).toEqual({ common: { hello: 'Hello' } });
    expect(b.etag).toBe(a.etag);
  });

  test('returns a fresh body+etag after a mutation invalidates the cache', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });
    const before = reg.getBundleJson('en');

    reg.setNamespaceLocale('common', 'en', { hello: 'Bonjour' }, { merge: false });

    const after = reg.getBundleJson('en');
    expect(after.etag).not.toBe(before.etag);
    expect(JSON.parse(after.body)).toEqual({ common: { hello: 'Bonjour' } });
  });

  test('evicts LRU resolved locales beyond the configured cap', () => {
    const reg = new TranslationRegistry({ maxResolvedLocales: 2 });
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });
    reg.setNamespaceLocale('common', 'fr', { hello: 'Bonjour' }, { merge: true });
    reg.setNamespaceLocale('common', 'de', { hello: 'Hallo' }, { merge: true });

    const en1 = reg.getBundleJson('en');
    const fr1 = reg.getBundleJson('fr');
    // Touching `en` again refreshes it as most-recently-used, so reading
    // `de` afterwards must evict `fr`, not `en`.
    reg.getBundleJson('en');
    reg.getBundleJson('de');

    // `en` survived the eviction → same Map identity → same cached body+etag.
    const en2 = reg.getBundleJson('en');
    expect(en2.etag).toBe(en1.etag);
    expect(en2.body).toBe(en1.body);

    // `fr` was evicted → resolved-locale Map is rebuilt → content-derived
    // etag still matches by hash.
    const fr2 = reg.getBundleJson('fr');
    expect(fr2.etag).toBe(fr1.etag);
  });
});

describe('TranslationRegistry — t()', () => {
  test('resolves a simple key with namespace prefix', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });
    expect(reg.t('en', 'common:hello')).toBe('Hello');
  });

  test('uses default namespace when no prefix is given', () => {
    const reg = new TranslationRegistry({ defaultNamespace: 'common' });
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });
    expect(reg.t('en', 'hello')).toBe('Hello');
  });

  test('interpolates {{params}}', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { greet: 'Hi {{name}}' }, { merge: true });
    expect(reg.t('en', 'common:greet', { name: 'Max' })).toBe('Hi Max');
  });

  test('applies pluralization', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale(
      'common',
      'en',
      { items_one: '1 item', items_other: '{{count}} items' },
      { merge: true }
    );
    expect(reg.t('en', 'common:items', { count: 1 })).toBe('1 item');
    expect(reg.t('en', 'common:items', { count: 5 })).toBe('5 items');
  });

  test('falls back to defaultValue when key missing', () => {
    const reg = new TranslationRegistry();
    expect(reg.t('en', 'common:missing', { defaultValue: 'fallback' })).toBe('fallback');
  });

  test('falls back through locale chain', () => {
    const reg = new TranslationRegistry();
    reg.setNamespaceLocale('common', 'en', { hello: 'Hello' }, { merge: true });
    expect(reg.t('fr-CH', 'common:hello')).toBe('Hello');
  });

  test('missingKeyHandler is invoked when key missing and no defaultValue', () => {
    const handler = mock((key: string) => `[missing:${key}]`);
    const reg = new TranslationRegistry({ missingKeyHandler: handler });
    expect(reg.t('en', 'common:absent')).toBe('[missing:common:absent]');
    expect(handler).toHaveBeenCalledWith('common:absent', 'en');
  });

  test('returns the key itself as last resort', () => {
    const reg = new TranslationRegistry();
    expect(reg.t('en', 'common:absent')).toBe('common:absent');
  });

  test('respects a custom nsSeparator', () => {
    const reg = new TranslationRegistry({ nsSeparator: '.' });
    reg.setNamespaceLocale('common', 'en', { hello: 'Hi' }, { merge: true });
    expect(reg.t('en', 'common.hello')).toBe('Hi');
  });
});
