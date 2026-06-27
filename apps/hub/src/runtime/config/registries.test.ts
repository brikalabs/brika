import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  applyPluginUrl,
  builtinRegistries,
  externalLinkForNpm,
  externalLinkForStore,
  operatorSearchStores,
  parseOperatorRegistries,
  pluginUrlForStore,
  readmeSourceForStore,
  resolveRegistries,
} from './registries';

describe('registry descriptors', () => {
  const originalStore = process.env.BRIKA_STORE_URL;
  const originalRegistry = process.env.BRIKA_REGISTRY_URL;

  beforeEach(() => {
    process.env.BRIKA_STORE_URL = undefined;
    process.env.BRIKA_REGISTRY_URL = undefined;
  });

  afterEach(() => {
    process.env.BRIKA_STORE_URL = originalStore;
    process.env.BRIKA_REGISTRY_URL = originalRegistry;
  });

  describe('builtinRegistries', () => {
    test('ships npm + brika presets with default URLs', () => {
      const builtins = builtinRegistries();

      expect(builtins.map((r) => r.id)).toEqual(['npm', 'brika']);
      const npm = builtins.find((r) => r.id === 'npm');
      expect(npm?.search).toEqual({ type: 'npm' });
      expect(npm?.readme).toEqual({ type: 'unpkg' });
      const brika = builtins.find((r) => r.id === 'brika');
      expect(brika?.search).toEqual({ type: 'v1', url: 'https://store.brika.dev' });
      expect(brika?.pluginUrl).toBe('https://store.brika.dev/{name}');
      expect(brika?.default).toBe(true);
    });

    test('honors BRIKA_STORE_URL / BRIKA_REGISTRY_URL overrides', () => {
      process.env.BRIKA_STORE_URL = 'https://store.acme.com/';
      process.env.BRIKA_REGISTRY_URL = 'https://npm.acme.com/';

      const brika = builtinRegistries().find((r) => r.id === 'brika');

      expect(brika?.search?.url).toBe('https://store.acme.com');
      expect(brika?.install?.registry).toBe('https://npm.acme.com');
      expect(brika?.pluginUrl).toBe('https://store.acme.com/{name}');
    });
  });

  describe('parseOperatorRegistries', () => {
    test('returns [] for an absent block', () => {
      expect(parseOperatorRegistries(undefined)).toEqual([]);
    });

    test('validates entries and trims URLs', () => {
      const parsed = parseOperatorRegistries([
        {
          id: 'acme',
          name: 'Acme',
          pluginUrl: 'https://acme.dev/p/{name} ',
          search: { type: 'v1', url: 'https://store.acme.com/' },
          install: { registry: 'https://npm.acme.com/' },
        },
      ]);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.pluginUrl).toBe('https://acme.dev/p/{name}');
      expect(parsed[0]?.search?.url).toBe('https://store.acme.com');
      expect(parsed[0]?.install?.registry).toBe('https://npm.acme.com');
    });

    test('degrades a malformed block to []', () => {
      expect(parseOperatorRegistries([{ name: 'no id' }])).toEqual([]);
    });
  });

  describe('resolveRegistries', () => {
    test('with no operator entries returns the built-ins', () => {
      expect(resolveRegistries([]).map((r) => r.id)).toEqual(['npm', 'brika']);
    });

    test('merges a partial operator entry over the built-in of the same id', () => {
      const resolved = resolveRegistries([{ id: 'npm', name: 'npm mirror' }]);

      const npm = resolved.find((r) => r.id === 'npm');
      expect(npm?.name).toBe('npm mirror');
      // Untouched fields keep the preset values.
      expect(npm?.search).toEqual({ type: 'npm' });
    });

    test('appends a brand-new registry', () => {
      const resolved = resolveRegistries([
        { id: 'acme', name: 'Acme', search: { type: 'v1', url: 'https://store.acme.com' } },
      ]);

      expect(resolved.map((r) => r.id)).toEqual(['npm', 'brika', 'acme']);
    });
  });

  describe('operatorSearchStores', () => {
    test('returns only v1 stores that carry a url', () => {
      const stores = operatorSearchStores([
        { id: 'acme', name: 'Acme', search: { type: 'v1', url: 'https://store.acme.com' } },
        { id: 'mirror', name: 'Mirror', search: { type: 'npm' } },
        { id: 'broken', name: 'Broken', search: { type: 'v1' } },
      ]);

      expect(stores).toEqual(['https://store.acme.com']);
    });
  });

  describe('pluginUrlForStore', () => {
    test('applies the matching registry pluginUrl template', () => {
      const registries = resolveRegistries([]);

      expect(pluginUrlForStore(registries, 'https://store.brika.dev', '@brika/plugin-clock')).toBe(
        'https://store.brika.dev/@brika/plugin-clock'
      );
    });

    test('uses a custom template when one is declared', () => {
      const registries = resolveRegistries([
        {
          id: 'acme',
          name: 'Acme',
          pluginUrl: 'https://acme.dev/p/{name}',
          search: { type: 'v1', url: 'https://store.acme.com' },
        },
      ]);

      expect(pluginUrlForStore(registries, 'https://store.acme.com', '@x/one')).toBe(
        'https://acme.dev/p/@x/one'
      );
    });

    test('falls back to <base>/<name> when no descriptor matches', () => {
      expect(pluginUrlForStore([], 'https://unknown.dev', '@x/one')).toBe(
        'https://unknown.dev/@x/one'
      );
    });
  });

  describe('applyPluginUrl', () => {
    test('replaces every {name} token', () => {
      expect(applyPluginUrl('https://x.dev/{name}?ref={name}', '@x/one')).toBe(
        'https://x.dev/@x/one?ref=@x/one'
      );
    });
  });

  describe('readmeSourceForStore', () => {
    test('defaults to v1 for a store with no readme override', () => {
      const registries = resolveRegistries([]);
      expect(readmeSourceForStore(registries, 'https://store.brika.dev')).toBe('v1');
    });

    test('honors a readme: unpkg override', () => {
      const registries = resolveRegistries([
        {
          id: 'acme',
          name: 'Acme',
          search: { type: 'v1', url: 'https://store.acme.com' },
          readme: { type: 'unpkg' },
        },
      ]);
      expect(readmeSourceForStore(registries, 'https://store.acme.com')).toBe('unpkg');
    });

    test('defaults to v1 for an unknown base', () => {
      expect(readmeSourceForStore([], 'https://unknown.dev')).toBe('v1');
    });
  });

  describe('externalLinkForStore', () => {
    test('returns the matching registry name + templated url', () => {
      const registries = resolveRegistries([]);
      expect(
        externalLinkForStore(registries, 'https://store.brika.dev', '@brika/plugin-clock')
      ).toEqual({ name: 'Brika Store', url: 'https://store.brika.dev/@brika/plugin-clock' });
    });

    test('falls back to a generic name + <base>/<name> for an unknown store', () => {
      expect(externalLinkForStore([], 'https://unknown.dev', '@x/one')).toEqual({
        name: 'Store',
        url: 'https://unknown.dev/@x/one',
      });
    });
  });

  describe('externalLinkForNpm', () => {
    test('builds the link from the npm registry descriptor', () => {
      const registries = resolveRegistries([]);
      expect(externalLinkForNpm(registries, '@brika/plugin-clock')).toEqual({
        name: 'npm',
        url: 'https://www.npmjs.com/package/@brika/plugin-clock',
      });
    });

    test('is undefined when no npm registry declares a pluginUrl', () => {
      // Override the npm preset to drop its pluginUrl template.
      const registries = resolveRegistries([{ id: 'npm', name: 'npm', pluginUrl: undefined }]);
      expect(externalLinkForNpm(registries, '@x/one')).toBeUndefined();
    });
  });
});
