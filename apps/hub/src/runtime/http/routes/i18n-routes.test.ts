import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { i18nRoutes } from '@/runtime/http/routes/i18n';
import { I18nService } from '@/runtime/i18n';

describe('i18n routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockI18n: {
    listLocales: ReturnType<typeof mock>;
    listNamespaces: ReturnType<typeof mock>;
    getAllTranslations: ReturnType<typeof mock>;
    getBundleJson: ReturnType<typeof mock>;
    onChange: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockI18n = {
      listLocales: mock().mockReturnValue(['en', 'fr']),
      listNamespaces: mock().mockReturnValue(['common', 'bricks']),
      getAllTranslations: mock().mockReturnValue({
        common: {
          hello: 'Hello',
        },
      }),
      getBundleJson: mock().mockReturnValue({
        body: '{"common":{"hello":"Hello"}}',
        etag: '"abc"',
      }),
      onChange: mock().mockReturnValue(() => {}),
    };
    stub(I18nService, mockI18n);
    app = TestApp.create(i18nRoutes);
  });

  test('GET /api/i18n/locales returns locale list', async () => {
    const res = await app.get<{
      locales: string[];
    }>('/api/i18n/locales');

    expect(res.status).toBe(200);
    expect(res.body.locales).toEqual(['en', 'fr']);
  });

  test('GET /api/i18n/namespaces returns namespace list', async () => {
    const res = await app.get<{
      namespaces: string[];
    }>('/api/i18n/namespaces');

    expect(res.status).toBe(200);
    expect(res.body.namespaces).toEqual(['common', 'bricks']);
  });

  test('GET /api/i18n/bundle/:locale returns the cached bundle JSON', async () => {
    const res = await app.get<Record<string, unknown>>('/api/i18n/bundle/en');

    expect(res.status).toBe(200);
    expect(mockI18n.getBundleJson).toHaveBeenCalledWith('en');
  });

  test('GET /api/i18n/bundle/:locale returns 304 when If-None-Match matches', async () => {
    const res = await app.get('/api/i18n/bundle/en', { headers: { 'if-none-match': '"abc"' } });
    expect(res.status).toBe(304);
  });
});
