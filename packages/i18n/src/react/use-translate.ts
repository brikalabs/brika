/**
 * Translation-only hook. Provides `t`, `tp`, `locale`, and `changeLocale`
 * without constructing any `Intl.*Format` instances — components that just
 * need to render translated strings should use this hook instead of
 * `useLocale`, which is ~8× heavier on mount.
 */

import { type TOptions } from 'i18next';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnownKey } from '../registry';
import { parseKey } from '../translate';
import { switchLanguage } from './client';

// Declaration-merge i18next's `TFunction` so calling it with `(key, options)`
// from a dynamic wrapper resolves to a `string` overload — i18next 25's
// strict generic overloads otherwise reject the shape (one alternative wants
// arg 1 to be `defaultValue: string`). Inlined here rather than in a separate
// `.d.ts` because consumers downstream (apps/ui) don't automatically pick up
// sibling ambient declarations when the package is imported by name.
declare module 'i18next' {
  interface TFunction {
    (key: string, options?: TOptions): string;
  }
}

/**
 * Typed `t()` signature. Day-1 with an empty `Namespaces` augmentation, the
 * narrow overload is unreachable (`KnownKey = never`) and the broad overload
 * accepts any string. Once a tooling layer emits a registry augmentation, the
 * narrow overload lights up — unknown keys become compile errors.
 */
export type I18nT = {
  <K extends KnownKey>(key: K, options?: TOptions): string;
  (key: string, options?: TOptions): string;
};

/**
 * Typed `tp()` helper for callers that work with explicit namespaces. Takes
 * the **full** namespace (the consumer prefixes it themselves) so this hook
 * stays free of any application-specific naming conventions.
 *
 * The narrow overload is reachable once `Namespaces` is augmented to include
 * the namespace strings; otherwise it falls back to the broad signature.
 */
/**
 * The optional 4th `__cs` parameter is reserved for build-time source-location
 * injection (the call-site transform appends `'file:line'` so the dev overlay
 * can show where the call lives). At runtime it's forwarded via the options
 * bag so the i18n-devtools wrapper picks it up.
 */
export type I18nTp = (
  namespace: string,
  key: string,
  defaultValue?: string,
  __cs?: string
) => string;

export interface UseTranslateResult {
  readonly t: I18nT;
  readonly tp: I18nTp;
  readonly locale: string;
  readonly changeLocale: (loc: string) => Promise<void>;
}

export function useTranslate(): UseTranslateResult {
  const { t: baseT, i18n } = useTranslation(undefined, {
    useSuspense: true,
  });
  const locale = i18n.language;
  const nsSeparator = typeof i18n.options.nsSeparator === 'string' ? i18n.options.nsSeparator : ':';
  const defaultNamespace =
    typeof i18n.options.defaultNS === 'string' ? i18n.options.defaultNS : 'translation';

  const t = useMemo<I18nT>(
    () =>
      function t(rawKey: string, options?: TOptions): string {
        if (locale === 'cimode') {
          return rawKey;
        }

        const nsOpt = options?.ns;
        const explicitNs = typeof nsOpt === 'string' ? nsOpt : undefined;
        // Reuse the registry's `parseKey` so the in-key separator semantics
        // match every other call site. Day-1 the narrow overload is
        // unreachable, so all calls land on the broad signature.
        const parsed = parseKey(rawKey, defaultNamespace, nsSeparator);
        const effectiveNs =
          explicitNs ?? (rawKey.includes(nsSeparator) ? parsed.namespace : undefined);

        // The `ns:key` syntax tells us which namespace this call needs. If
        // it's not in the resource store yet, throw the load promise — React
        // Suspense pauses the component until the bundle arrives, and the
        // next render's `t()` call falls through to the normal path. The
        // namespace gets registered (even as `{}` on 404) so `hasResourceBundle`
        // stays true afterwards and we don't re-throw.
        if (effectiveNs && !i18n.hasResourceBundle(locale, effectiveNs)) {
          throw i18n.loadNamespaces(effectiveNs);
        }

        if (effectiveNs && !explicitNs) {
          return baseT(parsed.path, {
            ...options,
            ns: effectiveNs,
          });
        }

        return baseT(rawKey, options);
      },
    [baseT, locale, nsSeparator, defaultNamespace, i18n]
  );

  const tp = useMemo<I18nTp>(
    () =>
      function tp(namespace: string, key: string, defaultValue?: string, __cs?: string): string {
        // Plugin namespaces load lazily through the HTTP backend. If this one
        // isn't in the store yet, kick off the load (fire-and-forget, deduped
        // by i18next) — react-i18next's `loaded` binding then re-renders this
        // component with the populated bundle. Without this, `tp` returns the
        // `defaultValue` fallback until some unrelated re-render happens to run
        // after the namespace loaded elsewhere (the "click the tab twice to see
        // the translation" bug). A 404 registers the namespace as `{}`, so
        // `hasResourceBundle` stays true afterwards and this never re-fires.
        if (locale !== 'cimode' && !i18n.hasResourceBundle(locale, namespace)) {
          void i18n.loadNamespaces(namespace);
        }
        // Forward `__cs` into the options bag so the i18n-devtools `t()`
        // wrapper picks up the build-time call site for the runtime usage
        // map. Compiler call-site injection wraps `tp()` with the same
        // metadata; without forwarding it here, plugin tp() call sites
        // would never appear in the overlay's "Used in N files" panel.
        const options = __cs
          ? { ns: namespace, defaultValue, __cs }
          : { ns: namespace, defaultValue };
        return baseT(key, options);
      },
    [baseT, locale, i18n]
  );

  const changeLocale = useCallback(async (loc: string) => {
    // `switchLanguage` awaits namespace loads BEFORE flipping the active
    // language, so the next render sees populated bundles instead of
    // flashing keys.
    await switchLanguage(loc);
  }, []);

  return useMemo(() => ({ t, tp, locale, changeLocale }), [t, tp, locale, changeLocale]);
}
