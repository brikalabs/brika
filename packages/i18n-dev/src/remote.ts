/**
 * Fetch translation data from a remote brika hub for the dev overlay.
 *
 * Used when `i18nDevtools({ apiUrl })` is set. The hub already exposes the
 * endpoints we need (`/locales`, `/namespaces`, `/bundle/:locale`) so this
 * module is a thin HTTP client — no caching, no retries. Errors surface as
 * empty results so the local-file pipeline keeps working.
 */

import { isPlainObject } from './object';

export interface RemoteScanResult {
  /** locale → namespace → data */
  readonly translations: Map<string, Map<string, Record<string, unknown>>>;
  /** Locales the hub advertises (may be a superset of what's actually returned). */
  readonly locales: readonly string[];
}

export async function fetchRemoteTranslations(
  apiUrl: string,
  options: { signal?: AbortSignal } = {}
): Promise<RemoteScanResult> {
  const base = apiUrl.replace(/\/$/, '');

  const localesResponse = await safeFetchJson(`${base}/locales`, options.signal);
  const locales = extractLocales(localesResponse);
  if (locales.length === 0) {
    return { translations: new Map(), locales: [] };
  }

  const translations = new Map<string, Map<string, Record<string, unknown>>>();
  await Promise.all(
    locales.map(async (locale) => {
      const bundle = await safeFetchJson(`${base}/bundle/${locale}`, options.signal);
      if (!isPlainObject(bundle)) {
        return;
      }
      const nsMap = new Map<string, Record<string, unknown>>();
      for (const [ns, data] of Object.entries(bundle)) {
        if (isPlainObject(data)) {
          nsMap.set(ns, data);
        }
      }
      if (nsMap.size > 0) {
        translations.set(locale, nsMap);
      }
    })
  );

  return { translations, locales };
}

async function safeFetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return undefined;
    }
    return await res.json();
  } catch {
    return undefined;
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
