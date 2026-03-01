/**
 * Tests for I18nService
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { I18nService } from '@/runtime/i18n/i18n-service';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({
  autoStub: false,
});
const bun = useBunMock();

describe('I18nService', () => {
  let service: I18nService;
  let mockConfigLoader: {
    getRootDir: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockConfigLoader = {
      getRootDir: mock().mockReturnValue('/test/hub'),
    };

    stub(Logger);
    provide(ConfigLoader, mockConfigLoader);
    service = get(I18nService);
  });

  describe('init', () => {
    test('loads core translations from locales directory', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {
            hello: 'Hello',
            world: 'World',
          },
          '/test/hub/locales/en/nav.json': {
            home: 'Home',
            settings: 'Settings',
          },
          '/test/hub/locales/fr/common.json': {
            hello: 'Bonjour',
            world: 'Monde',
          },
        })
        .apply();

      await service.init();

      const locales = service.listLocales();
      expect(locales).toContain('en');
      expect(locales).toContain('fr');
    });

    test('lists namespaces from loaded translations', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {
            greeting: 'Hello',
          },
          '/test/hub/locales/en/plugins.json': {
            title: 'Plugins',
          },
        })
        .apply();

      await service.init();

      const namespaces = service.listNamespaces();
      expect(namespaces).toContain('common');
      expect(namespaces).toContain('plugins');
    });

    test('handles missing locales directory gracefully', async () => {
      bun
        .fs({
          '/test/hub/locales/': [],
        })
        .apply();

      await service.init();

      const locales = service.listLocales();
      expect(locales).toContain('cimode');
    });
  });

  describe('listLocales', () => {
    test('returns sorted locales with cimode at end', async () => {
      bun
        .fs({
          '/test/hub/locales/': ['fr/', 'en/', 'de/'],
          '/test/hub/locales/en/common.json': {},
          '/test/hub/locales/fr/common.json': {},
          '/test/hub/locales/de/common.json': {},
        })
        .apply();

      await service.init();

      const locales = service.listLocales();
      expect(locales).toEqual(['de', 'en', 'fr', 'cimode']);
    });
  });

  describe('listNamespaces', () => {
    test('returns sorted namespaces', async () => {
      bun
        .fs({
          '/test/hub/locales/en/zeta.json': {},
          '/test/hub/locales/en/alpha.json': {},
          '/test/hub/locales/en/beta.json': {},
        })
        .apply();

      await service.init();

      const namespaces = service.listNamespaces();
      expect(namespaces).toEqual(['alpha', 'beta', 'zeta']);
    });

    test('includes plugin namespaces with prefix', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {},
          '/test/plugin/locales/en/plugin.json': {
            name: 'Test Plugin',
          },
        })
        .apply();

      await service.init();
      await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      const namespaces = service.listNamespaces();
      expect(namespaces).toContain('common');
      expect(namespaces).toContain('plugin:@test/plugin');
    });
  });

  describe('getNamespaceTranslations', () => {
    beforeEach(async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {
            greeting: 'Hello',
            farewell: 'Goodbye',
          },
          '/test/hub/locales/fr/common.json': {
            greeting: 'Bonjour',
          },
        })
        .apply();

      await service.init();
    });

    test('returns translations for requested locale', () => {
      const translations = service.getNamespaceTranslations('en', 'common');

      expect(translations).toEqual({
        greeting: 'Hello',
        farewell: 'Goodbye',
      });
    });

    test('returns translations with fallback chain', () => {
      const translations = service.getNamespaceTranslations('fr', 'common');

      expect(translations).toEqual({
        greeting: 'Bonjour',
        farewell: 'Goodbye',
      });
    });

    test('returns null for unknown namespace', () => {
      const translations = service.getNamespaceTranslations('en', 'unknown');

      expect(translations).toBeNull();
    });

    test('handles regional locale fallback (fr-CH → fr → en)', () => {
      const translations = service.getNamespaceTranslations('fr-CH', 'common');

      expect(translations).toEqual({
        greeting: 'Bonjour',
        farewell: 'Goodbye',
      });
    });

    test('returns plugin translations with prefix namespace', async () => {
      bun.fs({
        '/test/plugin/locales/en/plugin.json': {
          name: 'Test Plugin',
          description: 'A test plugin',
        },
      });

      await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      const translations = service.getNamespaceTranslations('en', 'plugin:@test/plugin');

      expect(translations).toEqual({
        name: 'Test Plugin',
        description: 'A test plugin',
      });
    });

    test('returns null for unregistered plugin namespace', () => {
      const translations = service.getNamespaceTranslations('en', 'plugin:@unknown/plugin');

      expect(translations).toBeNull();
    });

    test('applies fallback for plugin translations', async () => {
      bun.fs({
        '/test/plugin/locales/en/plugin.json': {
          name: 'Test Plugin',
          description: 'English description',
        },
        '/test/plugin/locales/fr/plugin.json': {
          name: 'Plugin de Test',
        },
      });

      await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      const translations = service.getNamespaceTranslations('fr', 'plugin:@test/plugin');

      expect(translations).toEqual({
        name: 'Plugin de Test',
        description: 'English description',
      });
    });
  });

  describe('registerPluginTranslations', () => {
    test('registers plugin translations and returns detected locales', async () => {
      bun
        .fs({
          '/test/plugin/locales/en/plugin.json': {
            name: 'English',
          },
          '/test/plugin/locales/fr/plugin.json': {
            name: 'French',
          },
          '/test/plugin/locales/de/plugin.json': {
            name: 'German',
          },
        })
        .apply();

      const locales = await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      expect(locales).toEqual(['de', 'en', 'fr']);
    });

    test('merges multiple JSON files in locale folder', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {},
          '/test/plugin/locales/en/plugin.json': {
            name: 'Test Plugin',
          },
          '/test/plugin/locales/en/blocks.json': {
            timer: {
              name: 'Timer',
            },
          },
        })
        .apply();

      await service.init();
      await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      const translations = service.getNamespaceTranslations('en', 'plugin:@test/plugin');

      expect(translations).toEqual({
        name: 'Test Plugin',
        timer: {
          name: 'Timer',
        },
      });
    });

    test('returns empty array when no locales folder exists', async () => {
      bun.apply();

      const locales = await service.registerPluginTranslations(
        '@test/no-locales',
        '/test/no-locales'
      );

      expect(locales).toEqual([]);
    });

    test('handles empty locale folders', async () => {
      bun
        .fs({
          '/test/plugin/locales/en/': [],
        })
        .apply();

      const locales = await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      expect(locales).toEqual(['en']);
    });
  });

  describe('unregisterPluginTranslations', () => {
    test('removes plugin translations', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {},
          '/test/plugin/locales/en/plugin.json': {
            name: 'Test',
          },
        })
        .apply();

      await service.init();
      await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      expect(service.getNamespaceTranslations('en', 'plugin:@test/plugin')).not.toBeNull();

      service.unregisterPluginTranslations('@test/plugin');

      expect(service.getNamespaceTranslations('en', 'plugin:@test/plugin')).toBeNull();
    });

    test('does nothing for unregistered plugin', () => {
      bun.apply();
      service.unregisterPluginTranslations('@test/unknown');
    });
  });

  describe('fallback chain', () => {
    test('builds correct chain for simple locale', async () => {
      bun
        .fs({
          '/test/hub/locales/en/test.json': {
            key: 'English',
          },
        })
        .apply();

      await service.init();

      const translations = service.getNamespaceTranslations('de', 'test');
      expect(translations).toEqual({
        key: 'English',
      });
    });

    test('builds correct chain for regional locale', async () => {
      bun
        .fs({
          '/test/hub/locales/en/test.json': {
            a: 'en-a',
            b: 'en-b',
            c: 'en-c',
          },
          '/test/hub/locales/pt/test.json': {
            a: 'pt-a',
            b: 'pt-b',
          },
          '/test/hub/locales/pt-BR/test.json': {
            a: 'pt-BR-a',
          },
        })
        .apply();

      await service.init();

      const translations = service.getNamespaceTranslations('pt-BR', 'test');
      expect(translations).toEqual({
        a: 'pt-BR-a',
        b: 'pt-b',
        c: 'en-c',
      });
    });

    test('does not duplicate en in fallback chain', async () => {
      bun
        .fs({
          '/test/hub/locales/en/test.json': {
            key: 'value',
          },
        })
        .apply();

      await service.init();

      const translations = service.getNamespaceTranslations('en', 'test');
      expect(translations).toEqual({
        key: 'value',
      });
    });
  });

  describe('deep merge', () => {
    test('merges nested objects correctly', async () => {
      bun
        .fs({
          '/test/hub/locales/en/test.json': {
            nested: {
              a: 'en-a',
              b: 'en-b',
              deep: {
                x: 'en-x',
                y: 'en-y',
              },
            },
          },
          '/test/hub/locales/fr/test.json': {
            nested: {
              a: 'fr-a',
              deep: {
                x: 'fr-x',
              },
            },
          },
        })
        .apply();

      await service.init();

      const translations = service.getNamespaceTranslations('fr', 'test');
      expect(translations).toEqual({
        nested: {
          a: 'fr-a',
          b: 'en-b',
          deep: {
            x: 'fr-x',
            y: 'en-y',
          },
        },
      });
    });

    test('does not merge arrays', async () => {
      bun
        .fs({
          '/test/hub/locales/en/test.json': {
            items: ['a', 'b', 'c'],
          },
          '/test/hub/locales/fr/test.json': {
            items: ['x', 'y'],
          },
        })
        .apply();

      await service.init();

      const translations = service.getNamespaceTranslations('fr', 'test');
      expect(translations).toEqual({
        items: ['x', 'y'],
      });
    });
  });
});
