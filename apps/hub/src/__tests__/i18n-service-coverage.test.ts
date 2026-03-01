/**
 * Supplementary coverage tests for I18nService
 *
 * Targets uncovered lines not exercised by the main test suite:
 *   - Lines 229-235: getAllTranslations() method
 *   - Lines 278-311: #loadEmbeddedLocales() fallback path
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

describe('I18nService — coverage gaps', () => {
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

  // ─── getAllTranslations (lines 229-235) ────────────────────────────────

  describe('getAllTranslations', () => {
    test('returns all namespaces for a locale with fallback applied', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {
            greeting: 'Hello',
            farewell: 'Goodbye',
          },
          '/test/hub/locales/en/nav.json': {
            home: 'Home',
            settings: 'Settings',
          },
          '/test/hub/locales/fr/common.json': {
            greeting: 'Bonjour',
          },
        })
        .apply();

      await service.init();

      const result = service.getAllTranslations('fr');

      // common namespace: French "greeting" overrides English, English "farewell" falls through
      expect(result.common).toEqual({
        greeting: 'Bonjour',
        farewell: 'Goodbye',
      });
      // nav namespace: only English exists, falls through for French
      expect(result.nav).toEqual({
        home: 'Home',
        settings: 'Settings',
      });
    });

    test('includes plugin namespaces in bulk response', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {
            greeting: 'Hello',
          },
          '/test/plugin/locales/en/plugin.json': {
            name: 'Timer',
            description: 'A timer',
          },
        })
        .apply();

      await service.init();
      await service.registerPluginTranslations('@brika/timer', '/test/plugin');

      const result = service.getAllTranslations('en');

      expect(result.common).toEqual({
        greeting: 'Hello',
      });
      expect(result['plugin:@brika/timer']).toEqual({
        name: 'Timer',
        description: 'A timer',
      });
    });

    test('returns empty object when no namespaces match the locale', async () => {
      bun
        .fs({
          '/test/hub/locales/': [],
        })
        .apply();

      await service.init();

      const result = service.getAllTranslations('en');

      expect(result).toEqual({});
    });

    test('applies regional locale fallback in bulk response', async () => {
      bun
        .fs({
          '/test/hub/locales/en/common.json': {
            a: 'en-a',
            b: 'en-b',
            c: 'en-c',
          },
          '/test/hub/locales/fr/common.json': {
            a: 'fr-a',
            b: 'fr-b',
          },
          '/test/hub/locales/fr-CA/common.json': {
            a: 'fr-CA-a',
          },
        })
        .apply();

      await service.init();

      const result = service.getAllTranslations('fr-CA');

      expect(result.common).toEqual({
        a: 'fr-CA-a',
        b: 'fr-b',
        c: 'en-c',
      });
    });
  });

  // ─── #loadEmbeddedLocales fallback (lines 278-311) ─────────────────────

  describe('#loadEmbeddedLocales fallback', () => {
    test('falls back to embedded archive when locales directory is absent', async () => {
      // Do NOT set up a virtual locales directory — the real Bun.Glob will
      // throw ENOENT for the non-existent /test/hub/locales, which triggers
      // the catch in #loadCoreTranslations → calls #loadEmbeddedLocales.
      // The embedded archive (@/locales.tar) is available at build time,
      // so translations load from the archive instead.

      // Don't apply bun mock — let real Bun.Glob throw for the missing dir
      await service.init();

      // Service should still be usable — embedded locales loaded
      const locales = service.listLocales();
      expect(locales).toContain('cimode');
      expect(locales).toContain('en');

      // The embedded archive provides core namespaces
      const namespaces = service.listNamespaces();
      expect(namespaces.length).toBeGreaterThan(0);
      expect(namespaces).toContain('common');
    });

    test('embedded translations are queryable after loading from archive', async () => {
      // Trigger the embedded locales path
      await service.init();

      // Verify we can query translations loaded from the embedded archive
      const common = service.getNamespaceTranslations('en', 'common');
      expect(common).not.toBeNull();

      // French translations should also be available via fallback
      const frCommon = service.getNamespaceTranslations('fr', 'common');
      expect(frCommon).not.toBeNull();
    });

    test('getAllTranslations works with embedded archive data', async () => {
      // Trigger the embedded locales path, then use getAllTranslations
      await service.init();

      const all = service.getAllTranslations('en');
      expect(Object.keys(all).length).toBeGreaterThan(0);
      expect(all.common).not.toBeNull();
    });

    test('plugin translations work alongside embedded core translations', async () => {
      // Trigger embedded locales path first
      await service.init();

      // Now register plugin translations on top
      bun
        .fs({
          '/test/plugin/locales/en/plugin.json': {
            name: 'Test',
          },
        })
        .apply();

      await service.registerPluginTranslations('@test/plugin', '/test/plugin');

      const translations = service.getNamespaceTranslations('en', 'plugin:@test/plugin');
      expect(translations).toEqual({
        name: 'Test',
      });

      // getAllTranslations should include both core and plugin
      const all = service.getAllTranslations('en');
      expect(all['plugin:@test/plugin']).toEqual({
        name: 'Test',
      });
      expect(all.common).not.toBeNull();
    });
  });
});
