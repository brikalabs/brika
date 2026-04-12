import i18next from 'i18next';
import { HMR_FIX } from '../hmr-events';
import { resolvePath, setNestedValue } from '../nested-path';
import type { KeyUsage, KeyUsageMap } from '../scan-usage';
import type { FixEntry, ValidationIssue } from '../types';

export const REFERENCE_LOCALE = 'en';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TranslationEntry {
  ns: string;
  key: string;
  value: string;
}

type StoreData = Record<string, Record<string, unknown>>;
type I18nStoreShape = { data?: Record<string, StoreData> };

function getStore(): I18nStoreShape | undefined {
  return i18next.store as I18nStoreShape | undefined;
}

// ─── Store access ───────────────────────────────────────────────────────────

export function getStoreData(locale?: string): StoreData | undefined {
  return getStore()?.data?.[locale ?? i18next.language];
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

/** Walk all leaf string entries in a store data object, calling `visitor` for each. */
export function walkStoreEntries(
  resources: StoreData,
  visitor: (ns: string, key: string, value: string) => void
) {
  function walk(obj: Record<string, unknown>, ns: string, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') {
        visitor(ns, path, v);
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, ns, path);
      }
    }
  }
  for (const [ns, data] of Object.entries(resources)) {
    if (typeof data === 'object' && data !== null) {
      walk(data, ns, '');
    }
  }
}

export function getTranslations(locale?: string): TranslationEntry[] {
  const resources = getStoreData(locale);
  if (!resources) {
    return [];
  }
  const out: TranslationEntry[] = [];
  walkStoreEntries(resources, (ns, key, value) => out.push({ ns, key, value }));
  return out.sort((a, b) => `${a.ns}:${a.key}`.localeCompare(`${b.ns}:${b.key}`));
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

function getNsData(locale: string, ns: string) {
  return getStore()?.data?.[locale]?.[ns];
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

function removeFromI18nextStore(locale: string, ns: string, key: string) {
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
  const storeData = getStoreData(locale);
  const nsData = storeData?.[ns];
  if (typeof nsData !== 'object' || nsData === null) {
    return undefined;
  }
  const resolved = resolvePath(nsData, keyPath);
  if (!resolved) {
    return undefined;
  }
  const val = resolved.parent[resolved.key];
  return typeof val === 'string' ? val : undefined;
}

// ─── Autofix ────────────────────────────────────────────────────────────────

export function buildFix(issue: ValidationIssue): FixEntry | null {
  if (!issue.key) {
    return null;
  }
  switch (issue.type) {
    case 'missing-key':
    case 'missing-variable': {
      const refValue = getNestedStoreValue(issue.referenceLocale, issue.namespace, issue.key);
      if (refValue === undefined) {
        return null;
      }
      return {
        type: 'set',
        locale: issue.locale,
        namespace: issue.namespace,
        key: issue.key,
        value: refValue,
      };
    }
    case 'extra-key':
      return {
        type: 'delete',
        locale: issue.locale,
        namespace: issue.namespace,
        key: issue.key,
      };
    default:
      return null;
  }
}

export function sendFixes(fixes: FixEntry[]) {
  const hot = import.meta.hot;
  if (!hot || fixes.length === 0) {
    return;
  }
  hot.send(HMR_FIX, { fixes });
  for (const fix of fixes) {
    if (fix.type === 'set' && fix.value !== undefined) {
      updateI18nextStore(fix.locale, fix.namespace, fix.key, fix.value);
    } else if (fix.type === 'delete') {
      removeFromI18nextStore(fix.locale, fix.namespace, fix.key);
    }
  }
}

export function fixIssue(issue: ValidationIssue) {
  const fix = buildFix(issue);
  if (fix) {
    sendFixes([fix]);
  }
}

export function fixAllIssues(issues: ValidationIssue[]) {
  const fixes = issues.map(buildFix).filter((f): f is FixEntry => f !== null);
  sendFixes(fixes);
}

// ─── Key usage data ────────────────────────────────────────────────────────

let keyUsageData: KeyUsageMap = {};
const usageListeners = new Set<() => void>();
const EMPTY_USAGES: KeyUsage[] = [];

/** i18next plural suffixes — when looking up usage for `key_one`, also check `key`. */
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

/** Strip i18next plural suffix from a qualified key, returning the base key or null. */
function stripPluralSuffix(qualifiedKey: string): string | null {
  const colonIdx = qualifiedKey.indexOf(':');
  const ns = colonIdx >= 0 ? qualifiedKey.slice(0, colonIdx + 1) : '';
  const key = colonIdx >= 0 ? qualifiedKey.slice(colonIdx + 1) : qualifiedKey;

  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return ns + key.slice(0, -suffix.length);
    }
  }
  return null;
}

export function applyKeyUsage(data: KeyUsageMap) {
  keyUsageData = data;
  for (const listener of usageListeners) {
    listener();
  }
}

export function getKeyUsage(qualifiedKey: string): KeyUsage[] {
  const direct = keyUsageData[qualifiedKey];
  if (direct) {
    return direct;
  }
  // Fall back to the base key without plural suffix (e.g. `ns:items_one` → `ns:items`)
  const baseKey = stripPluralSuffix(qualifiedKey);
  if (baseKey) {
    return keyUsageData[baseKey] ?? EMPTY_USAGES;
  }
  return EMPTY_USAGES;
}

export function subscribeKeyUsage(listener: () => void): () => void {
  usageListeners.add(listener);
  return () => usageListeners.delete(listener);
}

// ─── Translation tracker ────────────────────────────────────────────────────

export const trackedTranslations = new Map<string, string>();
let trackerInstalled = false;

export function installTranslationTracker() {
  if (trackerInstalled) {
    return;
  }
  trackerInstalled = true;

  const origT = i18next.t.bind(i18next);
  // @ts-expect-error — wrapping t() to capture rendered translation strings
  i18next.t = (...args: Parameters<typeof i18next.t>) => {
    const result = origT(...args);
    if (typeof result === 'string' && result.length > 0) {
      let key = typeof args[0] === 'string' ? args[0] : '';
      const opts = args[1];
      if (opts && typeof opts === 'object' && 'ns' in opts) {
        const ns = (opts as Record<string, unknown>).ns;
        if (typeof ns === 'string' && !key.includes(':')) {
          key = `${ns}:${key}`;
        }
      }
      trackedTranslations.set(result, key);
    }
    return result;
  };
}
