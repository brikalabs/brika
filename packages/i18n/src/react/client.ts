/**
 * React-side i18next bootstrap.
 *
 * Wires up a per-namespace HTTP backend (`GET <apiPrefix>/:locale/:namespace`)
 * and an SSE subscription for live registry updates (`GET <apiPrefix>/events`).
 *
 * Language switching goes through `switchLanguage()`: it pre-loads the target
 * language's bundles *before* flipping `i18n.language`, so React never renders
 * against an empty store. Direct `i18n.changeLanguage` still works but races
 * with renders — every entry point in this workspace should use `switchLanguage`.
 *
 * Apps call `createI18n()` once at startup; it returns the configured `i18next`
 * instance ready for `useTranslation`.
 *
 * All mutable state lives on `I18nClient` so tests can construct a fresh
 * instance per case. The exported `createI18n()` keeps a process-wide
 * singleton for app code.
 */

import i18n, { type i18n as I18nInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { buildHttpBackend, HttpNamespaceLoader } from './http-backend';
import { type RegistryChange, RegistryEventStream } from './sse-stream';

export interface CreateI18nOptions {
  /** API base for namespace + event endpoints. Default `'/api/i18n'`. */
  readonly apiPrefix?: string;
  /** Default namespace if the caller doesn't pass `ns:` prefix. Default `'common'`. */
  readonly defaultNamespace?: string;
  /**
   * Extra namespaces to pre-load at i18next init (alongside the default
   * namespace). Use this for namespaces that are needed on every route —
   * layout-level strings — so Suspense awaits them once at boot and
   * components never render against an unloaded namespace.
   *
   * Per-page namespaces should still be lazy: declare them via
   * `useTranslation('settings')` inside the component that needs them;
   * Suspense will await them when the component mounts.
   */
  readonly eagerNamespaces?: readonly string[];
  /** Fallback locale. Default `'en'`. */
  readonly fallbackLng?: string;
  /** Toggle verbose i18next logging. Default `false`. */
  readonly debug?: boolean;
}

class I18nClient {
  readonly #loader: HttpNamespaceLoader;
  readonly #stream: RegistryEventStream;
  readonly #defaultNamespace: string;
  readonly #eagerNamespaces: readonly string[];
  readonly #fallbackLng: string;
  readonly #debug: boolean;
  #initialized = false;

  constructor(opts: CreateI18nOptions) {
    const apiPrefix = opts.apiPrefix ?? '/api/i18n';
    this.#defaultNamespace = opts.defaultNamespace ?? 'common';
    this.#eagerNamespaces = opts.eagerNamespaces ?? [];
    this.#fallbackLng = opts.fallbackLng ?? 'en';
    this.#debug = opts.debug ?? false;
    this.#loader = new HttpNamespaceLoader(apiPrefix);
    this.#stream = new RegistryEventStream({
      apiPrefix,
      onChange: (change) => this.#handleRegistryChange(change),
      onReconnect: () => void this.reloadTranslations(),
    });
  }

  init(): I18nInstance {
    if (this.#initialized) {
      return i18n;
    }
    this.#initialized = true;

    const defaultNs = this.#defaultNamespace;
    const namespaces = [defaultNs, ...this.#eagerNamespaces];

    i18n
      .use(buildHttpBackend(this.#loader))
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        ns: namespaces,
        defaultNS: defaultNs,
        fallbackLng: this.#fallbackLng,
        load: 'currentOnly',
        partialBundledLanguages: true,

        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: 'i18nextLng',
          convertDetectedLanguage: (lng: string) => lng.split('-')[0] ?? lng,
        },

        react: { useSuspense: true },
        interpolation: { escapeValue: false },
        // Our HTTP backend is read-only — never try to "save" missing keys back
        // through it. Setting this to a no-op suppresses i18next's `did not save
        // key X as namespace Y was not yet loaded` warning that fires whenever
        // `saveMissing` is on (the devtools overlay enables it for the runtime
        // tab). The `missingKey` event still fires for the overlay to capture.
        saveMissing: false,
        missingKeyHandler: () => undefined,
        debug: this.#debug,
      });

    this.#stream.start();
    return i18n;
  }

  /**
   * Canonical entry point for changing the active language.
   *
   * Awaits namespace fetches for `targetLanguage` *before* calling
   * `i18n.changeLanguage`. React's next render sees fully-populated bundles
   * instead of flashing translation keys / firing Suspense for every component.
   *
   * Use this from app code, devtools overlays, anywhere a user-initiated locale
   * change happens. Direct `i18n.changeLanguage` is supported by i18next but
   * races against React renders — prefer this wrapper.
   */
  async switchLanguage(targetLanguage: string): Promise<void> {
    if (targetLanguage === i18n.language) {
      return;
    }
    if (targetLanguage !== 'cimode') {
      const namespaces = this.#collectNamespacesToPreload(targetLanguage);
      if (namespaces.length > 0) {
        await Promise.all(
          namespaces.map((ns) => this.#loader.load(targetLanguage, ns).catch(() => undefined))
        );
      }
    }
    await i18n.changeLanguage(targetLanguage);
  }

  /**
   * Force-reload all currently-loaded namespaces for the active language.
   * Clears the known-missing set so namespaces that became available after
   * initial boot will be retried on next use.
   */
  async reloadTranslations(): Promise<void> {
    const language = i18n.language;
    this.#loader.clear();
    await i18n.reloadResources(language);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Collect every namespace the UI might need on the new language. Pulls from:
   *   1. Namespaces loaded for any *other* language — what the UI was actively
   *      using before the switch (wouldn't be in the store otherwise).
   *   2. The configured default namespaces (`i18n.options.ns`) — important on
   *      the very first switch, before any `useTranslation` has mounted and
   *      populated the store.
   *
   * Without (2) the first switch (e.g. on a setup wizard before any translated
   * component renders) returns an empty list and the new language never preloads.
   */
  #collectNamespacesToPreload(targetLanguage: string): string[] {
    const set = new Set<string>();
    for (const lng of Object.keys(i18n.store.data)) {
      if (lng === targetLanguage) {
        continue;
      }
      for (const ns of Object.keys(i18n.store.data[lng] ?? {})) {
        set.add(ns);
      }
    }
    const configured = i18n.options.ns;
    if (typeof configured === 'string') {
      set.add(configured);
    } else if (Array.isArray(configured)) {
      for (const ns of configured) {
        set.add(ns);
      }
    }
    return [...set];
  }

  #handleRegistryChange(change: RegistryChange): void {
    const language = i18n.language;

    if (change.kind === 'clear') {
      this.#loader.clear();
      void i18n.reloadResources(language);
      return;
    }

    if (!change.namespace) {
      return;
    }

    if (change.kind === 'remove') {
      // Don't strip the bundle outright — that leaves the UI with no data AND no
      // pending promise to suspend on, so `t()` returns the key until next route
      // change. Trigger a reload instead: the backend returns `{}` for a real
      // removal (UI shows keys via missingKey path) or refreshed data for a
      // transient swap.
      if (i18n.hasResourceBundle(language, change.namespace)) {
        this.#loader.forgetMissing(`${language}:${change.namespace}`);
        void i18n.reloadResources(language, change.namespace);
      }
      return;
    }

    // change.kind === 'set'
    if (change.locale && change.locale !== language) {
      return;
    }
    // Refetch if either we already have the bundle (content changed) OR we'd
    // previously 404'd it (missing→present transition — e.g. a late-registered
    // namespace). Either way clear the skip-list entry before fetching so
    // `loader.load` doesn't short-circuit on the cached miss.
    const missingKey = `${language}:${change.namespace}`;
    const wasMissing = this.#loader.forgetMissing(missingKey);
    if (wasMissing || i18n.hasResourceBundle(language, change.namespace)) {
      void this.#loader.load(language, change.namespace);
    }
  }
}

let singleton: I18nClient | null = null;

/**
 * Initialize i18next with the per-namespace HTTP backend + SSE live updates.
 * Idempotent — calling more than once returns the existing instance.
 */
export function createI18n(options: CreateI18nOptions = {}): I18nInstance {
  singleton ??= new I18nClient(options);
  return singleton.init();
}

/**
 * Canonical entry point for changing the active language. See
 * `I18nClient#switchLanguage` for details. No-op when `createI18n` hasn't been
 * called yet.
 */
export function switchLanguage(targetLanguage: string): Promise<void> {
  return singleton?.switchLanguage(targetLanguage) ?? Promise.resolve();
}

/**
 * Force-reload all currently-loaded namespaces for the active language. No-op
 * when `createI18n` hasn't been called yet.
 */
export function reloadTranslations(): Promise<void> {
  return singleton?.reloadTranslations() ?? Promise.resolve();
}
