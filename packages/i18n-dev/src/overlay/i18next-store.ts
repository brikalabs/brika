import { isTranslationData } from '@brika/i18n';
import i18next from 'i18next';
import { resolvePath, setNestedValue } from '../nested-path';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Shape we trust on `i18next.store.data`. i18next exposes the field as
 * `Record<lang, Record<ns, ResourceKey>>` — `ResourceKey` is the user's
 * translation tree. We narrow to plain object containers at the boundary
 * and walk leaves with structural checks (`isTranslationData`).
 *
 * Mutations land directly on the live store reference returned by
 * `getNsData`. Parsing through zod would clone the data and silently break
 * the update flow, so we use type guards instead.
 */
export type NamespaceData = Record<string, unknown>;
export type StoreData = Record<string, NamespaceData>;
export type StoreShape = { readonly data?: Record<string, StoreData> };

function hasDataField(value: unknown): value is StoreShape {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (!('data' in value)) {
    return true;
  }
  const data = value.data;
  return data === undefined || (typeof data === 'object' && data !== null);
}

/**
 * Return the underlying `i18next.store` reference (not a clone) if its
 * `.data` field is the shape we expect. The store's data is what i18next
 * mutates on `addResourceBundle`, so we hand back the live object.
 */
function getStore(): StoreShape | undefined {
  const raw: unknown = i18next.store;
  return hasDataField(raw) ? raw : undefined;
}

// ─── Store access ───────────────────────────────────────────────────────────

export function getStoreData(locale?: string): StoreData | undefined {
  const data = getStore()?.data;
  if (!data) {
    return undefined;
  }
  const value = data[locale ?? i18next.language];
  return value !== null && typeof value === 'object' ? value : undefined;
}

let cachedLocales: string[] = [];

export function getLocales(): string[] {
  const data = getStore()?.data;
  if (!data) {
    if (cachedLocales.length > 0) {
      cachedLocales = [];
    }
    return cachedLocales;
  }
  const fresh = Object.keys(data)
    .filter((l) => l !== 'dev')
    .sort((a, b) => a.localeCompare(b));
  if (fresh.length === cachedLocales.length && fresh.every((l, i) => l === cachedLocales[i])) {
    return cachedLocales;
  }
  cachedLocales = fresh;
  return cachedLocales;
}

/**
 * Walk all leaf string entries in a store data object, calling `visitor`
 * for each. Mirrors `flatten` from `@brika/i18n` but yields per-entry
 * instead of building a Map — the overlay visits hundreds of keys per scan
 * and benefits from the early-exit shape.
 */
export function walkStoreEntries(
  resources: StoreData,
  visitor: (ns: string, key: string, value: string) => void
) {
  function walk(obj: Record<string, unknown>, ns: string, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        visitor(ns, path, v);
      } else if (isTranslationData(v)) {
        walk(v, ns, path);
      }
    }
  }
  for (const [ns, data] of Object.entries(resources)) {
    if (isTranslationData(data)) {
      walk(data, ns, '');
    }
  }
}

// ─── Store change subscription ─────────────────────────────────────────────

const storeListeners = new Set<() => void>();

function notifyStoreChange() {
  for (const listener of storeListeners) {
    listener();
  }
}

export function subscribeStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

// ─── Store mutations ────────────────────────────────────────────────────────

function emitStoreChange() {
  i18next.emit('languageChanged', i18next.language);
  notifyStoreChange();
}

function getNsData(locale: string, ns: string): NamespaceData | undefined {
  const localeData = getStoreData(locale);
  if (!localeData) {
    return undefined;
  }
  const nsData = localeData[ns];
  return isTranslationData(nsData) ? nsData : undefined;
}

export function applyTranslationBundle(
  bundle: Record<string, Record<string, Record<string, unknown>>>
) {
  for (const [locale, namespaces] of Object.entries(bundle)) {
    for (const [ns, data] of Object.entries(namespaces)) {
      i18next.addResourceBundle(locale, ns, data, true, true);
    }
  }
  emitStoreChange();
}

export function updateI18nextStore(locale: string, ns: string, key: string, value: string) {
  const nsData = getNsData(locale, ns);
  if (!nsData) {
    return;
  }
  setNestedValue(nsData, key, value);
  emitStoreChange();
}

export function removeFromI18nextStore(locale: string, ns: string, key: string) {
  const nsData = getNsData(locale, ns);
  if (!nsData) {
    return;
  }
  const resolved = resolvePath(nsData, key);
  if (resolved) {
    delete resolved.parent[resolved.key];
    emitStoreChange();
  }
}

export function getNestedStoreValue(
  locale: string,
  ns: string,
  keyPath: string
): string | undefined {
  const nsData = getNsData(locale, ns);
  if (!nsData) {
    return undefined;
  }
  const resolved = resolvePath(nsData, keyPath);
  if (!resolved) {
    return undefined;
  }
  const val = resolved.parent[resolved.key];
  return typeof val === 'string' ? val : undefined;
}
