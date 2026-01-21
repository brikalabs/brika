/**
 * I18n Service
 *
 * Handles loading translations from core and plugins with namespace-based API.
 * Supports locale fallback chains (e.g., fr-CH → fr → en).
 *
 * Namespaces:
 * - Core: "common", "nav", "plugins", etc. (from apps/hub/locales/)
 * - Plugins: "plugin:@brika/plugin-timer", "plugin:@brika/blocks-builtin", etc.
 */

import { inject, singleton } from '@brika/shared';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Prefix for plugin namespaces to avoid collisions with core namespaces */
const PLUGIN_NS_PREFIX = 'plugin:';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TranslationData = Record<string, unknown>;

interface PluginTranslations {
  pluginId: string;
  locales: Map<string, TranslationData>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deep merge two objects, with source values overriding target values.
 */
function deepMerge(target: TranslationData, source: TranslationData): TranslationData {
  const result: TranslationData = { ...target };

  for (const key in source) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as TranslationData, sourceVal as TranslationData);
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// I18n Service
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class I18nService {
  readonly #config = inject(ConfigLoader);
  readonly #logs = inject(Logger).withSource('i18n');

  /** Core translations by locale */
  readonly #coreTranslations = new Map<string, TranslationData>();

  /** Plugin translations by plugin ID */
  readonly #pluginTranslations = new Map<string, PluginTranslations>();

  /** All available locales (from core) */
  readonly #availableLocales = new Set<string>();

  /** Root directory for hub locales */
  #localesDir = '';

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const rootDir = this.#config.getRootDir();
    // Locales are in the hub's locales/ directory (relative to where hub runs)
    this.#localesDir = `${rootDir}/locales`;

    await this.#loadCoreTranslations();
    this.#logs.info('I18n system initialized', {
      availableLocales: [...this.#availableLocales],
      namespaceCount: this.listNamespaces().length,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get translations for a specific namespace with locale fallback.
   * This is the main API for fetching translations.
   *
   * @param locale - The requested locale (e.g., "fr-CH", "en")
   * @param namespace - Core namespace ("common") or plugin namespace ("plugin:@brika/plugin-timer")
   */
  getNamespaceTranslations(locale: string, namespace: string): TranslationData | null {
    const chain = this.#buildFallbackChain(locale);
    let result: TranslationData = {};

    // Check if it's a plugin namespace
    if (namespace.startsWith(PLUGIN_NS_PREFIX)) {
      const pluginId = namespace.slice(PLUGIN_NS_PREFIX.length);
      const plugin = this.#pluginTranslations.get(pluginId);
      if (!plugin) return null;

      // Apply fallback chain (reverse to start from fallback)
      for (const loc of chain.reverse()) {
        const data = plugin.locales.get(loc);
        if (data) {
          result = deepMerge(result, data);
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    }

    // Core namespace - look up in core translations
    for (const loc of chain.reverse()) {
      const coreData = this.#coreTranslations.get(loc);
      if (coreData?.[namespace]) {
        result = deepMerge(result, coreData[namespace] as TranslationData);
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * List all available namespaces (core + plugins).
   * Core namespaces come from JSON file names in locales folders.
   * Plugin namespaces are prefixed with "plugin:".
   */
  listNamespaces(): string[] {
    const namespaces = new Set<string>();

    // Core namespaces from JSON files
    for (const data of this.#coreTranslations.values()) {
      for (const key of Object.keys(data)) {
        namespaces.add(key);
      }
    }

    // Plugin namespaces with prefix
    for (const pluginId of this.#pluginTranslations.keys()) {
      namespaces.add(`${PLUGIN_NS_PREFIX}${pluginId}`);
    }

    return [...namespaces].sort();
  }

  /**
   * List all available locales (from core translations).
   * Includes "cimode" for development (i18next shows keys instead of values).
   */
  listLocales(): string[] {
    const locales = [...this.#availableLocales].sort();
    // Add cimode at the end - handled client-side by i18next
    locales.push('cimode');
    return locales;
  }

  /**
   * Register translations for a plugin.
   * Called by PluginManager when loading a plugin with a locales/ folder.
   */
  async registerPluginTranslations(pluginId: string, pluginDir: string): Promise<string[]> {
    const localesDir = `${pluginDir}/locales`;
    const detectedLocales: string[] = [];

    try {
      const glob = new Bun.Glob('*/');
      const entries = await Array.fromAsync(glob.scan({ cwd: localesDir, onlyFiles: false }));

      for (const entry of entries) {
        const locale = entry.replace('/', '');
        if (!locale) continue;

        detectedLocales.push(locale);

        // Load plugin translations (flattened, not namespaced by filename)
        const localeData = await this.#loadPluginLocaleFolder(`${localesDir}/${locale}`);
        if (Object.keys(localeData).length === 0) continue;

        // Get or create plugin translations entry
        let plugin = this.#pluginTranslations.get(pluginId);
        if (!plugin) {
          plugin = { pluginId, locales: new Map() };
          this.#pluginTranslations.set(pluginId, plugin);
        }

        plugin.locales.set(locale, localeData);
      }

      if (detectedLocales.length > 0) {
        this.#logs.debug('Plugin translations registered', {
          pluginId: pluginId,
          locales: detectedLocales,
        });
      }
    } catch {
      // No locales folder or error reading - that's fine
    }

    return detectedLocales.sort();
  }

  /**
   * Unregister translations for a plugin.
   * Called by PluginManager when unloading a plugin.
   */
  unregisterPluginTranslations(pluginId: string): void {
    if (this.#pluginTranslations.delete(pluginId)) {
      this.#logs.debug('Plugin translations unregistered', {
        pluginId: pluginId,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load all core translations from apps/hub/locales/
   */
  async #loadCoreTranslations(): Promise<void> {
    try {
      const glob = new Bun.Glob('*/');
      const entries = await Array.fromAsync(glob.scan({ cwd: this.#localesDir, onlyFiles: false }));

      for (const entry of entries) {
        const locale = entry.replace('/', '');
        if (!locale) continue;

        this.#availableLocales.add(locale);

        const localeData = await this.#loadLocaleFolder(`${this.#localesDir}/${locale}`);
        if (Object.keys(localeData).length > 0) {
          this.#coreTranslations.set(locale, localeData);
        }
      }
    } catch (e) {
      this.#logs.warn('Failed to load core translations', {}, { error: e });
    }
  }

  /**
   * Load all JSON files from a locale folder and merge them.
   * Each file becomes a namespace (e.g., common.json → { common: {...} })
   */
  async #loadLocaleFolder(folderPath: string): Promise<TranslationData> {
    const result: TranslationData = {};

    try {
      const glob = new Bun.Glob('*.json');
      const files = await Array.fromAsync(glob.scan({ cwd: folderPath }));

      for (const file of files) {
        const namespace = file.replace('.json', '');
        try {
          const content = await Bun.file(`${folderPath}/${file}`).json();
          result[namespace] = content;
        } catch (e) {
          this.#logs.warn(
            'Failed to load translation file',
            {
              filePath: `${folderPath}/${file}`,
            },
            { error: e }
          );
        }
      }
    } catch {
      // Folder doesn't exist or can't be read
    }

    return result;
  }

  /**
   * Load plugin translations from a locale folder.
   * For plugins, we merge all JSON files directly without namespacing by filename.
   * This allows plugin.json to contain: { "name": "...", "description": "..." }
   * which becomes accessible as: t("plugin-id:name")
   */
  async #loadPluginLocaleFolder(folderPath: string): Promise<TranslationData> {
    let result: TranslationData = {};

    try {
      const glob = new Bun.Glob('*.json');
      const files = await Array.fromAsync(glob.scan({ cwd: folderPath }));

      for (const file of files) {
        try {
          const content = await Bun.file(`${folderPath}/${file}`).json();
          // Merge directly without namespace
          result = deepMerge(result, content as TranslationData);
        } catch (e) {
          this.#logs.warn(
            'Failed to load translation file',
            {
              filePath: `${folderPath}/${file}`,
            },
            { error: e }
          );
        }
      }
    } catch {
      // Folder doesn't exist or can't be read
    }

    return result;
  }

  /**
   * Build fallback chain for a locale.
   * e.g., "fr-CH" → ["fr-CH", "fr", "en"]
   */
  #buildFallbackChain(locale: string): string[] {
    const chain: string[] = [locale];

    // Add base language if regional variant
    if (locale.includes('-')) {
      const base = locale.split('-')[0];
      if (!chain.includes(base)) {
        chain.push(base);
      }
    }

    // Always fallback to English
    if (!chain.includes('en')) {
      chain.push('en');
    }

    return chain;
  }
}
