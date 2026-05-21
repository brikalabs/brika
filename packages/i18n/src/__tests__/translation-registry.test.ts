import { describe, expect, mock, test } from 'bun:test';
import { TranslationRegistry } from '../translation-registry';

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

