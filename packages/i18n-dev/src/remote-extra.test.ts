/**
 * Extra coverage for remote.ts — targeting uncovered lines:
 *   - lines 52-53: bundle fetch returns an error (propagated to errors array)
 *   - line 56: bundle response is not a plain object (skipped silently)
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { fetchRemoteTranslations } from './remote';

const bun = useBunMock();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchRemoteTranslations extra coverage', () => {
  // ── lines 52-53: bundle fetch fails → error is collected ─────────────────

  test('pushes an error entry when a bundle fetch throws', async () => {
    let callCount = 0;
    bun.fetch(() => {
      callCount++;
      if (callCount === 1) {
        // /locales succeeds
        return Promise.resolve(jsonResponse({ locales: ['en'] }));
      }
      // /bundle/en throws
      return Promise.reject(new Error('bundle network failure'));
    });

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('bundle network failure'))).toBe(true);
  });

  test('pushes an error entry when a bundle fetch returns non-2xx', async () => {
    let callCount = 0;
    bun.fetch(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ locales: ['en'] }));
      }
      return Promise.resolve(jsonResponse({}, 503));
    });

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('HTTP 503'))).toBe(true);
  });

  // ── line 56: bundle response body is not a plain object ──────────────────

  test('skips locale when bundle response body is a JSON array (not a plain object)', async () => {
    let callCount = 0;
    bun.fetch(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ locales: ['en'] }));
      }
      // Bundle returns an array instead of an object
      return Promise.resolve(jsonResponse(['item1', 'item2']));
    });

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');

    // No errors for this case (non-plain-object is silently skipped)
    expect(result.errors).toHaveLength(0);
    // But no translations either
    expect(result.translations.size).toBe(0);
  });

  test('skips locale when bundle response body is a JSON string', async () => {
    let callCount = 0;
    bun.fetch(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ locales: ['en'] }));
      }
      return Promise.resolve(jsonResponse('just a string'));
    });

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');

    expect(result.errors).toHaveLength(0);
    expect(result.translations.size).toBe(0);
  });

  test('skips namespace entries where data is not a plain object', async () => {
    let callCount = 0;
    bun.fetch(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ locales: ['en'] }));
      }
      // Bundle has one valid namespace and one non-object value
      return Promise.resolve(
        jsonResponse({
          common: { hello: 'Hello' },
          broken: 'not an object',
          alsobroken: [1, 2, 3],
        })
      );
    });

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');

    expect(result.errors).toHaveLength(0);
    const enMap = result.translations.get('en');
    expect(enMap).toBeDefined();
    expect(enMap?.has('common')).toBe(true);
    // broken and alsobroken are non-plain-objects, should be skipped
    expect(enMap?.has('broken')).toBe(false);
    expect(enMap?.has('alsobroken')).toBe(false);
  });

  test('filters out cimode from the locales list', async () => {
    bun.fetch(() => Promise.resolve(jsonResponse({ locales: ['en', 'cimode', 'fr'] })));

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');
    // cimode is filtered by extractLocales
    expect(result.locales).not.toContain('cimode');
    expect(result.locales).toContain('en');
    expect(result.locales).toContain('fr');
  });

  test('handles locales response that is not a plain object gracefully', async () => {
    bun.fetch(() => Promise.resolve(jsonResponse(['en', 'fr'])));

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');
    // extractLocales returns [] for non-plain-object
    expect(result.translations.size).toBe(0);
    expect(result.locales).toHaveLength(0);
  });

  test('handles locales response where .locales is not an array', async () => {
    bun.fetch(() => Promise.resolve(jsonResponse({ locales: 'en,fr' })));

    const result = await fetchRemoteTranslations('http://hub.local/api/i18n');
    expect(result.translations.size).toBe(0);
    expect(result.locales).toHaveLength(0);
  });
});
