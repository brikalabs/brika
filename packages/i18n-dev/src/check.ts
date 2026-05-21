/// <reference types="bun-types" />

/**
 * Validates i18n translation completeness across all locales using union
 * semantics: the total key set per namespace is the union of every locale's
 * leaf keys. Any locale that lacks a key present elsewhere is reported.
 *
 * Auto-discovers workspace package locales from the nearest monorepo root.
 *
 * Usage: bun packages/i18n-dev/src/check.ts \
 *          [--locales <dir>] [--reference-locale <locale>] [--ci]
 */

import { join, resolve } from 'node:path';
import type { TranslationData } from '@brika/i18n';
import { discoverPackageLocales, findWorkspaceRoot } from '@brika/i18n/node';
import { scanLocaleDirectory } from './locale-scan';
import type { CoverageEntry, ValidationIssue } from './types';
import { validateLocales } from './validate';

function cliFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return (idx >= 0 ? process.argv[idx + 1] : undefined) ?? fallback;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const CWD = process.cwd();
// Walk up for a workspace root to position the default locales path. If no
// workspace marker is found (single-package consumers) we fall back to the
// current directory.
const ROOT = (await findWorkspaceRoot(CWD)) ?? CWD;
const CORE_LOCALES_DIR = resolve(cliFlag('--locales', join(CWD, 'src/locales')));
const REFERENCE_LOCALE = cliFlag('--reference-locale', 'en');
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

function reportIssues(label: string, issues: ValidationIssue[], unionKeyCount: number) {
  if (issues.length === 0) {
    ok(`${label}: ${unionKeyCount} keys (all locales aligned)`);
    return;
  }
  const missing = issues.filter((i) => i.type === 'missing-key');
  const missingNs = issues.filter((i) => i.type === 'missing-namespace');
  const missingVars = issues.filter((i) => i.type === 'missing-variable');

  const byLocale = new Map<string, string[]>();
  for (const issue of missing) {
    if (!issue.key) {
      continue;
    }
    const list = byLocale.get(issue.locale) ?? [];
    list.push(issue.key);
    byLocale.set(issue.locale, list);
  }
  for (const [locale, keys] of byLocale) {
    error(`${label} [${locale}]: ${keys.length} missing — ${keys.sort().join(', ')}`);
  }

  for (const issue of missingNs) {
    error(`${label} [${issue.locale}]: namespace missing entirely`);
  }

  if (missingVars.length > 0) {
    const sample = missingVars
      .slice(0, 5)
      .map((i) => `${i.locale}/${i.key} (missing {{${i.variables?.join('}}, {{')}}})`)
      .join('; ');
    const more = missingVars.length > 5 ? ` … +${missingVars.length - 5} more` : '';
    warn(`${label}: ${missingVars.length} variable mismatch(es) — ${sample}${more}`);
  }
}

function groupByNamespace<T extends { namespace: string }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const list = out.get(item.namespace) ?? [];
    list.push(item);
    out.set(item.namespace, list);
  }
  return out;
}

function unionKeyCountFromCoverage(coverage: CoverageEntry[], namespace: string): number {
  const entry = coverage.find((c) => c.namespace === namespace);
  return entry?.totalKeys ?? 0;
}

function collectNamespaceList(translations: Map<string, Map<string, TranslationData>>): string[] {
  const all = new Set<string>();
  for (const nsMap of translations.values()) {
    for (const ns of nsMap.keys()) {
      all.add(ns);
    }
  }
  return [...all].sort((a, b) => a.localeCompare(b));
}

// ─── 1. Core namespace parity ────────────────────────────────────────────────

async function checkCoreNamespaces() {
  console.log(`\nCore namespaces (display reference: ${REFERENCE_LOCALE})`);
  console.log('─'.repeat(40));

  const translations = await scanLocaleDirectory(CORE_LOCALES_DIR);
  if (translations.size === 0) {
    ok(`No core translations found in ${CORE_LOCALES_DIR}`);
    return;
  }

  const { issues, coverage } = validateLocales(translations, REFERENCE_LOCALE);
  const issuesByNs = groupByNamespace(issues);

  for (const ns of collectNamespaceList(translations)) {
    const nsIssues = issuesByNs.get(ns) ?? [];
    reportIssues(ns, nsIssues, unionKeyCountFromCoverage(coverage, ns));
  }
}

// ─── 2. Package namespace parity ─────────────────────────────────────────────

async function checkPackageNamespaces() {
  console.log(`\nPackage namespaces (display reference: ${REFERENCE_LOCALE})`);
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
    const { issues, coverage } = validateLocales(localeMap, REFERENCE_LOCALE);
    reportIssues(entry.namespace, issues, unionKeyCountFromCoverage(coverage, entry.namespace));
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
