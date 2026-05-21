/**
 * React-side i18next bootstrap.
 *
 * Boot: i18next is initialized with the eager namespaces. The i18next backend
 * fans every `read(language, ns)` call into a single bulk
 * `GET <apiPrefix>/bundle/:locale` — the first call kicks off the request,
 * every concurrent and subsequent ns waits on the same promise. One network
 * round-trip hydrates everything. Per-namespace endpoint is the fallback
 * for namespaces missing from the bundle (e.g. plugins registered post-boot).
 *
 * The runtime never opens any kind of live-update channel itself. In
 * production translations are cached for the page lifetime — they almost
 * never change. Dev tooling that wants to push fresh translations (e.g.
 * `@brika/i18n-dev` on file changes) calls `hydrateTranslations()` below.
 * The runtime stays HMR-agnostic; the dev tool owns the transport.
 *
 * Language switching goes through `switchLanguage()`: it pre-loads the target
 * language's bundle *before* flipping `i18n.language`, so React never renders
 * against an empty store. Direct `i18n.changeLanguage` still works but races
 * with renders — every entry point in this workspace should use `switchLanguage`.
 *
 * Apps call `createI18n()` once at startup; it returns the configured `i18next`
 * instance ready for `useTranslation`.
 */

import { isUnsafeKeySegment } from '@brika/i18n';
import i18n, { type i18n as I18nInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { BundleNamespaceLoader, buildHttpBackend } from './http-backend';

/**
 * Payload accepted by {@link hydrateTranslations}: `language → namespace → translations`.
 * Mirrors the structure the hub's bulk-bundle endpoint returns, one level deeper
 * (extra outer key for the language).
 */
export type TranslationsBundle = Record<string, Record<string, Record<string, unknown>>>;

export interface CreateI18nOptions {
  /** API base for namespace + bundle endpoints. Default `'/api/i18n'`. */
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
  readonly #loader: BundleNamespaceLoader;
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
    this.#loader = new BundleNamespaceLoader(apiPrefix);
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
        // `escapeValue: false` is the i18next-recommended setting when output
        // is rendered through React: React's JSX escapes text nodes already,
        // so letting i18next also escape would double-encode `&`, `<`, etc.
        // in legitimate translation strings.
        //
        // Threat model: every consumer of `t()` in this codebase MUST render
        // the result as a React text child (`<>{t(...)}</>`). Feeding `t()`
        // into `dangerouslySetInnerHTML` would turn a translation value
        // (which can include user-supplied interpolation data — plugin
        // names, setup-wizard inputs) into a script-injection vector.
        // If you ever introduce `<Trans>` with raw HTML or any HTML-sink
        // consumer, flip this to `true` AND add an escape check in the
        // affected component.
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

    return i18n;
  }

  /**
   * Canonical entry point for changing the active language.
   *
   * Awaits the bundle fetch for `targetLanguage` *before* calling
   * `i18n.changeLanguage`. React's next render sees populated bundles
   * instead of flashing translation keys / firing Suspense.
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
   * Push pre-fetched translations directly into the loader cache + i18next
   * store. The runtime stays transport-agnostic — dev tools and any other
   * out-of-band data source can hand a fully-built bundle here without
   * having to round-trip through the HTTP backend.
   *
   * Language codes are filtered through `isUnsafeKeySegment` and the
   * loader sanitizes namespace + translation trees, so a hostile payload
   * with `__proto__` at any depth can't reach i18next's store.
   */
  hydrate(bundle: TranslationsBundle): void {
    for (const [language, byNamespace] of Object.entries(bundle)) {
      if (isUnsafeKeySegment(language)) {
        continue;
      }
      this.#loader.hydrate(language, byNamespace);
    }
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
}

let singleton: I18nClient | null = null;

/**
 * Initialize i18next with the bulk-bundle backend. Idempotent — calling
 * more than once returns the existing instance.
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
 * Push pre-fetched translations into the active i18next instance.
 * No-op when `createI18n` hasn't been called yet.
 *
 * Used by out-of-band data sources (dev tooling like `@brika/i18n-dev`,
 * SSR hydration, tests) that already have a translations tree in memory
 * and want to skip the HTTP backend. The runtime itself never calls this.
 */
export function hydrateTranslations(bundle: TranslationsBundle): void {
  singleton?.hydrate(bundle);
}
