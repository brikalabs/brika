/// <reference types="bun-types" />

/**
 * Validates i18n translation completeness and consistency.
 *
 * Checks EN/FR key parity for all core namespaces and plugin translations.
 * Auto-discovers workspace plugin locales from the monorepo root.
 *
 * Usage: bun packages/i18n-dev/src/check.ts [--locales <dir>]
 */

import type { TranslationData } from '@brika/i18n';
import {
  discoverPackageLocales,
  findWorkspaceRoot,
  loadLocaleFolder,
} from '@brika/i18n/node';
import { join, resolve } from 'node:path';
import type { ValidationIssue } from './types';
import { extractKeys, validateLocales } from './validate';

function cliFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return (idx >= 0 ? process.argv[idx + 1] : undefined) ?? fallback;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const CWD = process.cwd();
// `bun --filter <pkg>` lands here in the package dir; walk up to find the
// workspace root so the default locales path resolves to the right place.
const ROOT = (await findWorkspaceRoot(CWD)) ?? CWD;
const CORE_LOCALES_DIR = resolve(cliFlag('--locales', join(ROOT, 'apps/hub/src/locales')));
const CI_MODE = process.argv.includes('--ci');

let errors = 0;
let warnings = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function error(msg: string) {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  errors++;
}

function warn(msg: string) {
  console.log(`  \x1b[33m!\x1b[0m ${msg}`);
  warnings++;
}

function ok(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function reportIssues(label: string, issues: ValidationIssue[], keyCount: number) {
  if (issues.length === 0) {
    ok(`${label}: ${keyCount} keys (match)`);
    return;
  }
  const missing = issues.filter((i) => i.type === 'missing-key');
  const extra = issues.filter((i) => i.type === 'extra-key');
  if (missing.length > 0) {
    error(
      `${label}: ${missing.length} key(s) missing in FR: ${missing.map((i) => i.key).join(', ')}`
    );
  }
  if (extra.length > 0) {
    warn(`${label}: ${extra.length} extra key(s) in FR: ${extra.map((i) => i.key).join(', ')}`);
  }
}

async function scanLocaleDirectory(
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

// ─── 1. Core namespace parity ────────────────────────────────────────────────

async function checkCoreNamespaces() {
  console.log('\nCore namespaces (EN ↔ FR)');
  console.log('─'.repeat(40));

  const translations = await scanLocaleDirectory(CORE_LOCALES_DIR);
  const { issues } = validateLocales(translations, 'en');

  const byNamespace = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const list = byNamespace.get(issue.namespace) ?? [];
    list.push(issue);
    byNamespace.set(issue.namespace, list);
  }

  const enData = translations.get('en');
  if (enData) {
    for (const ns of [...enData.keys()].sort((a, b) => a.localeCompare(b))) {
      const nsIssues = byNamespace.get(ns) ?? [];
      const keyCount = extractKeys(enData.get(ns) ?? {}).length;
      reportIssues(ns, nsIssues, keyCount);
    }
  }
}

// ─── 2. Package namespace parity ─────────────────────────────────────────────

async function checkPackageNamespaces() {
  console.log('\nPackage namespaces (EN ↔ FR)');
  console.log('─'.repeat(40));

  const wsRoot = await findWorkspaceRoot(ROOT);
  if (!wsRoot) {
    ok('Not in a workspace — skipping package scan');
    return;
  }

  const entries = await discoverPackageLocales(wsRoot);
  if (entries.length === 0) {
    ok('No packages with translations found');
    return;
  }

  const sorted = [...entries].sort((a, b) => a.namespace.localeCompare(b.namespace));
  for (const entry of sorted) {
    const localeMap = new Map<string, Map<string, TranslationData>>();
    for (const [locale, data] of entry.locales) {
      const nsMap = new Map<string, TranslationData>();
      nsMap.set(entry.namespace, data);
      localeMap.set(locale, nsMap);
    }
    const { issues } = validateLocales(localeMap, 'en');
    const enData = localeMap.get('en');
    const keyCount = enData ? extractKeys(enData.get(entry.namespace) ?? {}).length : 0;
    reportIssues(entry.namespace, issues, keyCount);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('\ni18n validation');
console.log('═'.repeat(40));

await checkCoreNamespaces();
await checkPackageNamespaces();

console.log(`\n${'─'.repeat(40)}`);
if (errors === 0 && warnings === 0) {
  console.log('\x1b[32mAll checks passed.\x1b[0m\n');
} else {
  const parts: string[] = [];
  if (errors > 0) {
    parts.push(`\x1b[31m${errors} error(s)\x1b[0m`);
  }
  if (warnings > 0) {
    parts.push(`\x1b[33m${warnings} warning(s)\x1b[0m`);
  }
  console.log(`${parts.join(', ')}\n`);
}

process.exit(errors > 0 || (CI_MODE && warnings > 0) ? 1 : 0);
