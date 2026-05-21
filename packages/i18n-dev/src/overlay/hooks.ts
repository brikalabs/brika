import i18next from 'i18next';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { HMR_EVENT, HMR_REQUEST, HMR_TRANSLATIONS, HMR_USAGE } from '../hmr-events';

import type { KeyUsage, KeyUsageMap } from '../scan-usage/types';
import type { ValidationResult } from '../types';
import { KeyUsageMapSchema, TranslationsBundleSchema, ValidationResultSchema } from './hmr-schemas';
import {
  applyKeyUsage,
  applyTranslationBundle,
  getLocales,
  getMergedKeyUsage,
  setReferenceLocale,
  subscribeKeyUsage,
  subscribeRuntimeUsages,
  subscribeStore,
} from './store';

export interface RuntimeEntry {
  key: string;
  namespace: string;
  locale: string;
  count: number;
}

type ToggleOp = 'toggle' | 'add' | 'delete';

function applyToggleOp(prev: Set<string>, key: string, op: ToggleOp): Set<string> {
  if (op === 'add' && prev.has(key)) {
    return prev;
  }
  if (op === 'delete' && !prev.has(key)) {
    return prev;
  }
  const next = new Set(prev);
  if (op === 'toggle') {
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
  } else {
    next[op](key);
  }
  return next;
}

export function useToggleSet() {
  const [set, setSet] = useState<Set<string>>(new Set());

  const update = useCallback((key: string, op: ToggleOp) => {
    setSet((prev) => applyToggleOp(prev, key, op));
  }, []);

  const toggle = useCallback((key: string) => update(key, 'toggle'), [update]);
  const add = useCallback((key: string) => update(key, 'add'), [update]);
  const remove = useCallback((key: string) => update(key, 'delete'), [update]);
  return { set, toggle, add, remove };
}

/**
 * `bun-types` declares `hot.on(event, callback: () => void)` with strict
 * zero-arity callbacks; the Vite runtime actually forwards the server's
 * payload as the first argument. Bridge each data-carrying handler through a
 * zero-arity function that reads its arg via the legacy `arguments` object —
 * types satisfied, runtime contract honoured, no cast or `@ts-expect-error`
 * needed.
 */
function bridgeHmrHandler(handler: (data: unknown) => void): () => void {
  return function bridged(this: unknown): void {
    // biome-ignore lint/complexity/noArguments: see bridgeHmrHandler() comment
    handler(arguments[0]);
  };
}

export function useHmrValidation() {
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) {
      return;
    }

    const onUpdate = (data: unknown) => {
      const parsed = ValidationResultSchema.safeParse(data);
      if (parsed.success) {
        // Keep the reference-locale state in sync with whatever the host
        // configured so the diff view + CI-mode toggle work for hosts that
        // use a non-English reference (`'fr'`, `'de'`, etc.).
        setReferenceLocale(parsed.data.referenceLocale);
        setValidation(parsed.data);
      }
    };
    const onTranslations = (data: unknown) => {
      const parsed = TranslationsBundleSchema.safeParse(data);
      if (parsed.success) {
        applyTranslationBundle(parsed.data);
      }
    };
    const onUsage = (data: unknown) => {
      const parsed = KeyUsageMapSchema.safeParse(data);
      if (parsed.success) {
        applyKeyUsage(parsed.data satisfies KeyUsageMap);
      }
    };

    const onUpdateBridged = bridgeHmrHandler(onUpdate);
    const onTranslationsBridged = bridgeHmrHandler(onTranslations);
    const onUsageBridged = bridgeHmrHandler(onUsage);

    hot.on(HMR_EVENT, onUpdateBridged);
    hot.on(HMR_TRANSLATIONS, onTranslationsBridged);
    hot.on(HMR_USAGE, onUsageBridged);
    // bun-types' `ImportMeta.hot` declaration omits `send`, but Vite's runtime
    // (loaded in the browser at dev time) provides it for client→server custom
    // events. Documented gap between bun-types and the real Vite contract.
    // @ts-expect-error bun-types missing `send` on import.meta.hot — see comment
    hot.send(HMR_REQUEST, {});

    return () => {
      hot.off?.(HMR_EVENT, onUpdateBridged);
      hot.off?.(HMR_TRANSLATIONS, onTranslationsBridged);
      hot.off?.(HMR_USAGE, onUsageBridged);
    };
  }, []);

  return validation;
}

export function useRuntimeMissing() {
  const [runtime, setRuntime] = useState<Map<string, RuntimeEntry>>(new Map());

  useEffect(() => {
    // Count missing keys via a ref so re-emissions (`t()` called every render
    // for keys that genuinely don't resolve) don't trigger a setState cycle.
    // Only NEW keys promote into React state and cause a re-render.
    const counts = new Map<string, number>();

    const handler = (lngs: readonly string[], ns: string, key: string) => {
      const id = `${ns}:${key}`;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      setRuntime((prev) => {
        if (prev.has(id) || prev.size >= 500) {
          return prev;
        }
        const next = new Map(prev);
        next.set(id, {
          key,
          namespace: ns,
          locale: lngs[0] ?? i18next.language,
          count: counts.get(id) ?? 1,
        });
        return next;
      });
    };

    i18next.on('missingKey', handler);
    return () => {
      i18next.off('missingKey', handler);
    };
  }, []);

  return { runtime, clearRuntime: () => setRuntime(new Map()) };
}

export function useCurrentLocale() {
  const [currentLang, setCurrentLang] = useState(i18next.language ?? 'en');

  useEffect(() => {
    const handler = (lng: string) => setCurrentLang(lng);
    i18next.on('languageChanged', handler);
    return () => {
      i18next.off('languageChanged', handler);
    };
  }, []);

  return currentLang;
}

export function useToggleShortcut(onToggle: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        onToggle();
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [onToggle]);
}

export function useNavigateEvent(cb: (key: string) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const handler = (e: Event) => {
      if (e instanceof CustomEvent && typeof e.detail === 'string') {
        ref.current(e.detail);
      }
    };
    globalThis.addEventListener('i18n-dev:navigate', handler);
    return () => globalThis.removeEventListener('i18n-dev:navigate', handler);
  }, []);
}

function subscribeKeyUsageCombined(listener: () => void): () => void {
  const offStatic = subscribeKeyUsage(listener);
  const offRuntime = subscribeRuntimeUsages(listener);
  return () => {
    offStatic();
    offRuntime();
  };
}

export function useKeyUsage(qualifiedKey: string): KeyUsage[] {
  return useSyncExternalStore(
    subscribeKeyUsageCombined,
    () => getMergedKeyUsage(qualifiedKey),
    () => getMergedKeyUsage(qualifiedKey)
  );
}

export function useLocales(): string[] {
  return useSyncExternalStore(subscribeStore, getLocales, getLocales);
}
