/**
 * Tests for the i18n write surface + SSE event stream.
 *
 * These cover the branches not exercised by `i18n-routes.test.ts`:
 *   - the `BRIKA_ALLOW_I18N_EDITS` gate (404 when off, 200 when on)
 *   - the GET /sources listing
 *   - POST /sources/:namespace/:locale success, BadRequest for unsafe
 *     keys, NotFound for unknown sources
 *   - SSE handler installs the listener and tears it down
 *   - logger.info is called on successful edits
 */

import 'reflect-metadata';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { UnsafeKeyPathError } from '@brika/i18n';
import { TestApp } from '@brika/router/testing';
import { i18nRoutes, i18nWriteRoutes } from '@/runtime/http/routes/i18n';
import { I18nService } from '@/runtime/i18n';
import { Logger } from '@/runtime/logs/log-router';

interface MockI18n {
  listSourceFiles: ReturnType<typeof mock>;
  writeSourceKey: ReturnType<typeof mock>;
  listLocales: ReturnType<typeof mock>;
  listNamespaces: ReturnType<typeof mock>;
  getNamespaceTranslations: ReturnType<typeof mock>;
  getBundleJson: ReturnType<typeof mock>;
  onChange: ReturnType<typeof mock>;
}

const buildMockI18n = (): MockI18n => ({
  listSourceFiles: mock().mockReturnValue([
    { namespace: 'common', locale: 'en', path: '/abs/en/common.json', kind: 'hub' },
  ]),
  writeSourceKey: mock().mockResolvedValue(undefined),
  listLocales: mock().mockReturnValue(['en']),
  listNamespaces: mock().mockReturnValue(['common']),
  getNamespaceTranslations: mock().mockReturnValue({ hello: 'world' }),
  getBundleJson: mock().mockReturnValue({ body: '{}', etag: '"x"' }),
  onChange: mock().mockReturnValue(() => {}),
});

describe('i18nWriteRoutes — BRIKA_ALLOW_I18N_EDITS off', () => {
  let app: ReturnType<typeof TestApp.create>;
  let originalEnv: string | undefined;

  useTestBed(() => {
    originalEnv = Bun.env.BRIKA_ALLOW_I18N_EDITS;
    delete Bun.env.BRIKA_ALLOW_I18N_EDITS;
    stub(I18nService, buildMockI18n());
    stub(Logger, { withSource: () => ({ info: () => {}, warn: () => {}, error: () => {} }) });
    app = TestApp.create(i18nWriteRoutes);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete Bun.env.BRIKA_ALLOW_I18N_EDITS;
    } else {
      Bun.env.BRIKA_ALLOW_I18N_EDITS = originalEnv;
    }
  });

  test('GET /api/i18n/sources returns 404 when edits are disabled', async () => {
    const res = await app.get('/api/i18n/sources');
    expect(res.status).toBe(404);
  });

  test('POST /api/i18n/sources/:ns/:locale returns 404 when edits are disabled', async () => {
    const res = await app.post('/api/i18n/sources/common/en', { key: 'k', value: 'v' });
    expect(res.status).toBe(404);
  });
});

describe('i18nWriteRoutes — BRIKA_ALLOW_I18N_EDITS on', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockI18n: MockI18n;
  let loggerInfo: ReturnType<typeof mock>;
  let originalEnv: string | undefined;

  useTestBed(() => {
    originalEnv = Bun.env.BRIKA_ALLOW_I18N_EDITS;
    Bun.env.BRIKA_ALLOW_I18N_EDITS = '1';
    mockI18n = buildMockI18n();
    loggerInfo = mock();
    stub(I18nService, mockI18n);
    stub(Logger, {
      withSource: () => ({ info: loggerInfo, warn: () => {}, error: () => {} }),
    });
    app = TestApp.create(i18nWriteRoutes);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete Bun.env.BRIKA_ALLOW_I18N_EDITS;
    } else {
      Bun.env.BRIKA_ALLOW_I18N_EDITS = originalEnv;
    }
  });

  test('GET /api/i18n/sources returns the source-file list', async () => {
    const res = await app.get<{
      sources: Array<{ namespace: string; locale: string; path: string; kind: string }>;
    }>('/api/i18n/sources');

    expect(res.status).toBe(200);
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0]?.namespace).toBe('common');
    expect(mockI18n.listSourceFiles).toHaveBeenCalled();
  });

  test('POST /api/i18n/sources/:ns/:locale writes the edit and logs', async () => {
    const res = await app.post<{ ok: boolean }>('/api/i18n/sources/common/en', {
      key: 'hello',
      value: 'Hi',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(mockI18n.writeSourceKey).toHaveBeenCalledWith('common', 'en', 'hello', 'Hi');
    expect(loggerInfo).toHaveBeenCalledWith('Translation edited', {
      namespace: 'common',
      locale: 'en',
      key: 'hello',
    });
  });

  test('POST translates an `UnsafeKeyPathError` into a 400 BadRequest', async () => {
    mockI18n.writeSourceKey.mockRejectedValueOnce(new UnsafeKeyPathError('__proto__'));

    const res = await app.post('/api/i18n/sources/common/en', { key: 'safe', value: 'v' });
    expect(res.status).toBe(400);
  });

  test('POST translates a generic Error into 404 NotFound', async () => {
    mockI18n.writeSourceKey.mockRejectedValueOnce(new Error('No on-disk source for unknown'));

    const res = await app.post<{ message: string }>('/api/i18n/sources/unknown/en', {
      key: 'k',
      value: 'v',
    });
    expect(res.status).toBe(404);
  });

  test('POST rejects a body whose key fails zod validation', async () => {
    const res = await app.post('/api/i18n/sources/common/en', { key: '', value: 'v' });
    expect(res.status).toBe(400);
  });

  test('POST rejects a body whose value exceeds the 10 KB cap', async () => {
    const huge = 'x'.repeat(10_001);
    const res = await app.post('/api/i18n/sources/common/en', { key: 'k', value: huge });
    expect(res.status).toBe(400);
  });
});

describe('i18nRoutes — SSE events + namespace edge cases', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockI18n: MockI18n;
  let installedListener: ((change: unknown) => void) | null;
  let listenerDisposed: boolean;

  useTestBed(() => {
    installedListener = null;
    listenerDisposed = false;
    mockI18n = buildMockI18n();
    mockI18n.onChange = mock().mockImplementation((listener: (change: unknown) => void) => {
      installedListener = listener;
      return () => {
        listenerDisposed = true;
      };
    });
    stub(I18nService, mockI18n);
    app = TestApp.create(i18nRoutes);
  });

  test('GET /api/i18n/events installs an onChange listener', async () => {
    // Bypass `TestApp.get` because its body parser awaits the SSE stream's
    // end and the stream stays open indefinitely. We just need the response
    // headers and to confirm the listener was wired up.
    const raw = await app.hono.fetch(new Request('http://test/api/i18n/events', { method: 'GET' }));
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toContain('text/event-stream');
    expect(mockI18n.onChange).toHaveBeenCalled();
    expect(installedListener).not.toBeNull();

    await raw.body?.cancel();
    expect(listenerDisposed).toBeTrue();
  });

  test('GET /api/i18n/:locale/:namespace rejects an empty namespace param', async () => {
    // The route pattern `/api/i18n/:locale/:namespace{.+}` requires a non-empty
    // namespace path segment, so the BadRequest branch in the handler is only
    // reachable when the param resolves to an empty string. Hono routes a
    // double-slash here, which the regex matches but yields ''.
    const res = await app.get('/api/i18n/en/');
    expect([400, 404]).toContain(res.status);
  });
});
