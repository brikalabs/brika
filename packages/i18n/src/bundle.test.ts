import { describe, expect, test } from 'bun:test';
import { BundleJsonCache } from './bundle';
import type { TranslationData } from './types';

describe('BundleJsonCache', () => {
  test('serialises the resolved map to JSON on first read', () => {
    const cache = new BundleJsonCache();
    const resolved = new Map<string, TranslationData>([
      ['common', { hello: 'Hello' }],
      ['layout', { title: 'Title' }],
    ]);

    const result = cache.get(resolved);

    expect(JSON.parse(result.body)).toEqual({
      common: { hello: 'Hello' },
      layout: { title: 'Title' },
    });
    expect(result.etag.startsWith('"')).toBe(true);
    expect(result.etag.endsWith('"')).toBe(true);
    expect(result.etag.length).toBeGreaterThan(2);
  });

  test('returns the same cached entry on a second read with the same Map identity', () => {
    const cache = new BundleJsonCache();
    const resolved = new Map<string, TranslationData>([['common', { a: '1' }]]);

    const a = cache.get(resolved);
    const b = cache.get(resolved);

    expect(b).toBe(a);
    expect(b.body).toBe(a.body);
    expect(b.etag).toBe(a.etag);
  });

  test('different Map identities produce independent entries (with equal content)', () => {
    const cache = new BundleJsonCache();
    const a = cache.get(new Map([['common', { a: '1' }]]));
    const b = cache.get(new Map([['common', { a: '1' }]]));

    // Same JSON body, but the cache is keyed on identity so these are not the
    // same object reference. ETag is content-derived so it matches.
    expect(b.body).toBe(a.body);
    expect(b.etag).toBe(a.etag);
  });

  test('different content yields different etag', () => {
    const cache = new BundleJsonCache();
    const a = cache.get(new Map([['common', { hello: 'Hello' }]]));
    const b = cache.get(new Map([['common', { hello: 'Bonjour' }]]));

    expect(a.etag).not.toBe(b.etag);
  });

  test('empty map produces a `{}` body with a stable etag', () => {
    const a = new BundleJsonCache().get(new Map());
    const b = new BundleJsonCache().get(new Map());

    expect(a.body).toBe('{}');
    // Two independent caches over the same content yield the same content-derived etag.
    expect(a.etag).toBe(b.etag);
  });

  test('etag handles non-ASCII content (codePointAt path)', () => {
    const cache = new BundleJsonCache();
    // Emoji forces the codePointAt fallback in fnv1a32.
    const result = cache.get(new Map([['common', { hi: 'Bonjour \u{1F600}' }]]));

    expect(result.etag.startsWith('"')).toBe(true);
    expect(result.etag.endsWith('"')).toBe(true);
    expect(result.etag.length).toBeGreaterThan(2);
  });
});
