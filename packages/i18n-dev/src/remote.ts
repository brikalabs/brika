/**
 * Fetch translation data from a remote brika hub for the dev overlay.
 *
 * Used when `i18nDevtools({ apiUrl })` is set. The hub already exposes the
 * endpoints we need (`/locales`, `/namespaces`, `/bundle/:locale`) so this
 * module is a thin HTTP client — no caching, no retries. Failures surface in
 * the `errors` array so the caller can show them in the overlay instead of
 * disguising them as missing keys.
 */

import { isPlainObject } from './object';

export interface RemoteScanResult {
  /** locale → namespace → data */
  readonly translations: Map<string, Map<string, Record<string, unknown>>>;
  /** Locales the hub advertises (may be a superset of what's actually returned). */
  readonly locales: readonly string[];
  /**
   * Human-readable failures encountered during the scan (network error,
   * non-2xx, JSON parse error, …). Empty when the scan succeeded cleanly.
   */
  readonly errors: readonly string[];
}

interface FetchOutcome {
  readonly value: unknown;
  readonly error?: string;
}

export async function fetchRemoteTranslations(
  apiUrl: string,
  options: { signal?: AbortSignal } = {}
): Promise<RemoteScanResult> {
  const base = apiUrl.replace(/\/$/, '');
  const errors: string[] = [];

  const localesOutcome = await fetchJson(`${base}/locales`, options.signal);
  if (localesOutcome.error) {
    errors.push(`failed to load ${base}/locales: ${localesOutcome.error}`);
  }
  const locales = extractLocales(localesOutcome.value);
  if (locales.length === 0) {
    return { translations: new Map(), locales: [], errors };
  }

  const translations = new Map<string, Map<string, Record<string, unknown>>>();
  await Promise.all(
    locales.map(async (locale) => {
      const url = `${base}/bundle/${locale}`;
      const { value, error } = await fetchJson(url, options.signal);
      if (error) {
        errors.push(`failed to load ${url}: ${error}`);
        return;
      }
      if (!isPlainObject(value)) {
        return;
      }
      const nsMap = new Map<string, Record<string, unknown>>();
      for (const [ns, data] of Object.entries(value)) {
        if (isPlainObject(data)) {
          nsMap.set(ns, data);
        }
      }
      if (nsMap.size > 0) {
        translations.set(locale, nsMap);
      }
    })
  );

  return { translations, locales, errors };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return { value: undefined, error: `HTTP ${res.status}` };
    }
    return { value: await res.json() };
  } catch (err) {
    return { value: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

function extractLocales(value: unknown): string[] {
  if (!isPlainObject(value)) {
    return [];
  }
  const list = value.locales;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((l): l is string => typeof l === 'string' && l !== 'cimode');
}
