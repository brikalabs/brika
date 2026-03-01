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
    getNamespaceTranslations: ReturnType<typeof mock>;
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
      getNamespaceTranslations: mock().mockReturnValue({
        hello: 'Hello',
      }),
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

  test('GET /api/i18n/bundle/:locale returns all translations', async () => {
    const res = await app.get<Record<string, unknown>>('/api/i18n/bundle/en');

    expect(res.status).toBe(200);
    expect(mockI18n.getAllTranslations).toHaveBeenCalledWith('en');
  });

  test('GET /api/i18n/:locale/:namespace returns translations', async () => {
    const res = await app.get('/api/i18n/en/common');

    expect(res.status).toBe(200);
    expect(mockI18n.getNamespaceTranslations).toHaveBeenCalledWith('en', 'common');
  });

  test('GET /api/i18n/:locale/:namespace returns 404 for unknown namespace', async () => {
    mockI18n.getNamespaceTranslations.mockReturnValue(null);

    const res = await app.get('/api/i18n/en/unknown');

    expect(res.status).toBe(404);
  });
});
