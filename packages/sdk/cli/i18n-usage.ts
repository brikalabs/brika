/**
 * CLI glue for the compiler's static i18n usage analysis: load the plugin's
 * sources and locale bundles from disk, run the edge-safe analysis, return
 * its diagnostics. Shared by `brika verify` (and therefore `brika publish`)
 * and `brika check`.
 */

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { I18nUsageDiagnostics } from '@brika/compiler';
import { analyzeI18nUsage, scanI18nUsage, sourceFiles } from '@brika/compiler';
import { PluginPackageSchema } from '@brika/schema';
import { loadAllLocaleBundles } from '../src/verify-checks/locale-bundles';

const NONE: I18nUsageDiagnostics = { errors: [], warnings: [] };

/**
 * Run the static i18n usage analysis for the plugin at `root`. Returns no
 * diagnostics when the manifest doesn't parse (the schema check already
 * reports that) — this layer only adds usage findings.
 */
export async function i18nUsageDiagnostics(root: string): Promise<I18nUsageDiagnostics> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    return NONE;
  }
  const parsed = PluginPackageSchema.safeParse(raw);
  if (!parsed.success) {
    return NONE;
  }

  const files = await sourceFiles(root);
  const entries = await Promise.all(
    files.map(async (file): Promise<[string, string]> => {
      const key = relative(root, file).replaceAll('\\', '/');
      return [key, await readFile(file, 'utf8')];
    })
  );
  const usage = scanI18nUsage(new Map(entries));
  const bundles = await loadAllLocaleBundles(root);
  return analyzeI18nUsage(usage, parsed.data, bundles);
}
