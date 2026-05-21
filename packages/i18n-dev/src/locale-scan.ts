/// <reference types="bun-types" />

import type { TranslationData } from '@brika/i18n';
import { loadLocaleFolder } from '@brika/i18n/node';

/**
 * Read every `<locale>/<namespace>.json` under `dir` into a nested map keyed by
 * locale then namespace. Returns an empty map when the directory is missing
 * — caller treats absence as "no translations yet" rather than a hard error.
 *
 * Both the dev orchestrator and the `check` CLI need this loader, so it lives
 * in a shared module to keep them in lockstep when the on-disk layout evolves.
 */
export async function scanLocaleDirectory(
  dir: string
): Promise<Map<string, Map<string, TranslationData>>> {
  const result = new Map<string, Map<string, TranslationData>>();
  const glob = new Bun.Glob('*/');
  let localeDirs: string[];
  try {
    localeDirs = await Array.fromAsync(glob.scan({ cwd: dir, onlyFiles: false }));
  } catch {
    return result;
  }
  for (const slash of localeDirs) {
    const locale = slash.replace('/', '');
    if (!locale) {
      continue;
    }
    const folder = await loadLocaleFolder(`${dir}/${locale}`);
    const nsMap = new Map<string, TranslationData>();
    for (const [ns, data] of Object.entries(folder)) {
      nsMap.set(ns, data);
    }
    if (nsMap.size > 0) {
      result.set(locale, nsMap);
    }
  }
  return result;
}
