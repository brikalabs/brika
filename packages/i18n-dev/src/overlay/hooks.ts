import i18next from 'i18next';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  HMR_EVENT,
  HMR_REQUEST,
  HMR_SAVE_RESULT,
  HMR_TRANSLATIONS,
  HMR_USAGE,
} from '../hmr-events';
import type { KeyUsage, KeyUsageMap } from '../scan-usage';
import type { ValidationResult } from '../types';
import {
  applyKeyUsage,
  applyTranslationBundle,
  getKeyUsage,
  getLocales,
  subscribeKeyUsage,
  subscribeStore,
} from './store';

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
      setValidation(data as ValidationResult);
    };
    const onSaveResult = (data: unknown) => {
      const r = data as { success: boolean; error?: string };
      if (!r.success) {
        console.error('[i18n-dev] Save failed:', r.error);
      }
    };
    const onTranslations = (data: unknown) => {
      applyTranslationBundle(data as Record<string, Record<string, Record<string, unknown>>>);
    };
    const onUsage = (data: unknown) => {
      applyKeyUsage(data as KeyUsageMap);
    };

    hot.on(HMR_EVENT, onUpdate);
    hot.on(HMR_SAVE_RESULT, onSaveResult);
    hot.on(HMR_TRANSLATIONS, onTranslations);
    hot.on(HMR_USAGE, onUsage);
    hot.send(HMR_REQUEST, {});

    return () => {
      hot.off?.(HMR_EVENT, onUpdate);
      hot.off?.(HMR_SAVE_RESULT, onSaveResult);
      hot.off?.(HMR_TRANSLATIONS, onTranslations);
      hot.off?.(HMR_USAGE, onUsage);
    };
  }, []);

  return validation;
}

export function useRuntimeMissing() {
  const [runtime, setRuntime] = useState<Map<string, RuntimeEntry>>(new Map());

  useEffect(() => {
    if (!i18next.options.saveMissing) {
      i18next.options.saveMissing = true;
    }

    const handler = (lngs: readonly string[], ns: string, key: string) => {
      setRuntime((prev) => {
        if (prev.size > 500) {
          return prev;
        }
        const id = `${ns}:${key}`;
        const existing = prev.get(id);
        const next = new Map(prev);
        next.set(id, {
          key,
          namespace: ns,
          locale: lngs[0] ?? i18next.language,
          count: (existing?.count ?? 0) + 1,
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

export function useKeyUsage(qualifiedKey: string): KeyUsage[] {
  return useSyncExternalStore(
    subscribeKeyUsage,
    () => getKeyUsage(qualifiedKey),
    () => getKeyUsage(qualifiedKey)
  );
}

export function useLocales(): string[] {
  return useSyncExternalStore(subscribeStore, getLocales, getLocales);
}
