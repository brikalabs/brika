import i18next from 'i18next';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { HMR_EVENT, HMR_REQUEST, HMR_TRANSLATIONS, HMR_USAGE } from '../hmr-events';

import type { KeyUsage, KeyUsageMap } from '../scan-usage';
import type { ValidationResult } from '../types';
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

// ─── Schemas for HMR boundary payloads ──────────────────────────────────────

const ValidationIssueSchema = z.object({
  type: z.enum(['missing-key', 'missing-namespace', 'missing-variable', 'unknown-key', 'dead-key']),
  severity: z.enum(['error', 'warning']),
  namespace: z.string(),
  locale: z.string(),
  key: z.string().optional(),
  referenceLocale: z.string(),
  variables: z.array(z.string()).optional(),
});

const CoverageEntrySchema = z.object({
  locale: z.string(),
  namespace: z.string(),
  totalKeys: z.number(),
  translatedKeys: z.number(),
  percentage: z.number(),
});

const ValidationResultSchema = z.object({
  issues: z.array(ValidationIssueSchema),
  coverage: z.array(CoverageEntrySchema),
  timestamp: z.number(),
  referenceLocale: z.string(),
});

const TranslationsBundleSchema = z.record(
  z.string(),
  z.record(z.string(), z.record(z.string(), z.unknown()))
);

const KeyUsageSchema = z.object({
  file: z.string(),
  line: z.number(),
});

const KeyUsageMapSchema = z.object({
  keys: z.record(z.string(), z.array(KeyUsageSchema)),
  patterns: z.array(z.string()),
  opaqueNamespaces: z.array(z.string()),
  hasGlobalOpaque: z.boolean(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuntimeEntry {
  key: string;
  namespace: string;
  locale: string;
  count: number;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

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
        // Keep the overlay's reference-locale state in sync with whatever the
        // host configured. Lets the diff view + CI-mode toggle work for hosts
        // that use a non-English reference (`'fr'`, `'de'`, etc.).
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

    // `bun-types` declares `hot.on(event, callback: () => void)` with strict
    // zero-arity callbacks; the Vite runtime actually forwards the server's
    // payload as the first argument. Bridge each data-carrying handler
    // through a zero-arity function that reads its arg via the legacy
    // `arguments` object — types satisfied, runtime contract honoured, no
    // cast or `@ts-expect-error` needed.
    // `bridge` reads the payload through `arguments[0]` because bun-types
    // declares `hot.on(event, cb: () => void)` — an arity-0 signature — but
    // the Vite runtime forwards the server's payload as the first arg. No
    // rest-params/typed-signature workaround keeps both `tsc` and Biome happy
    // without `@ts-expect-error` or an `as` cast at the call site.
    function bridge(handler: (data: unknown) => void): () => void {
      return function bridged(this: unknown): void {
        // biome-ignore lint/complexity/noArguments: see bridge() comment above
        handler(arguments[0]);
      };
    }
    const onUpdateBridged = bridge(onUpdate);
    const onTranslationsBridged = bridge(onTranslations);
    const onUsageBridged = bridge(onUsage);

    hot.on(HMR_EVENT, onUpdateBridged);
    hot.on(HMR_TRANSLATIONS, onTranslationsBridged);
    hot.on(HMR_USAGE, onUsageBridged);
    // bun-types' `ImportMeta.hot` declaration omits `send` — but Vite's
    // runtime (which is what's actually loaded in the browser at dev time)
    // provides it for client→server custom events. This is the documented
    // gap between bun-types' shape and the real Vite runtime contract.
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
