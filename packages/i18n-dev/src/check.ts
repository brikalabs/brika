/// <reference types="bun-types" />

/**
 * Validates i18n translation completeness and consistency.
 *
 * Checks EN/FR key parity for all core namespaces and plugin translations.
 * Auto-discovers workspace plugin locales from the monorepo root.
 *
 * Usage: bun packages/i18n-dev/src/check.ts [--locales <dir>]
 */

import { join, resolve } from 'node:path';
import { cliFlag } from './cli-utils';
import { discoverPluginRoots, findWorkspaceRoot, scanLocaleDirectory, scanPluginLocales } from './scan';
import type { ValidationIssue } from './types';
import { extractKeys, validateLocales } from './validate';

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const CORE_LOCALES_DIR = resolve(cliFlag('--locales', join(ROOT, 'apps/hub/src/locales')));

let errors = 0;
let warnings = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function error(msg: string) {
  console.log(`  \x1b[31m\u2717\x1b[0m ${msg}`);
  errors++;
}

function warn(msg: string) {
  console.log(`  \x1b[33m!\x1b[0m ${msg}`);
  warnings++;
}

function ok(msg: string) {
  console.log(`  \x1b[32m\u2713\x1b[0m ${msg}`);
}

function reportIssues(label: string, issues: ValidationIssue[], keyCount: number) {
  if (issues.length === 0) {
    ok(`${label}: ${keyCount} keys (match)`);
    return;
  }
  const missing = issues.filter((i) => i.type === 'missing-key');
  const extra = issues.filter((i) => i.type === 'extra-key');
  if (missing.length > 0) {
    error(`${label}: ${missing.length} key(s) missing in FR: ${missing.map((i) => i.key).join(', ')}`);
  }
  if (extra.length > 0) {
    warn(`${label}: ${extra.length} extra key(s) in FR: ${extra.map((i) => i.key).join(', ')}`);
  }
}

// ─── 1. Core namespace parity ────────────────────────────────────────────────

async function checkCoreNamespaces() {
  console.log('\nCore namespaces (EN \u2194 FR)');
  console.log('\u2500'.repeat(40));

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

// ─── 2. Plugin namespace parity ──────────────────────────────────────────────

async function checkPluginNamespaces() {
  console.log('\nPlugin namespaces (EN \u2194 FR)');
  console.log('\u2500'.repeat(40));

  const wsRoot = await findWorkspaceRoot(ROOT);
  if (!wsRoot) {
    ok('Not in a workspace — skipping plugin scan');
    return;
  }

  const pluginRoots = await discoverPluginRoots(wsRoot, CORE_LOCALES_DIR);
  if (pluginRoots.length === 0) {
    ok('No plugins with translations found');
    return;
  }

  const entries = await scanPluginLocales(pluginRoots);
  const sorted = entries.toSorted((a, b) => a.packageName.localeCompare(b.packageName));
  for (const { packageName, locales } of sorted) {
    const { issues } = validateLocales(locales, 'en');
    const enData = locales.get('en');
    const keyCount = enData ? extractKeys(enData.get('plugin') ?? {}).length : 0;
    reportIssues(packageName, issues, keyCount);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('\ni18n validation');
console.log('\u2550'.repeat(40));

await checkCoreNamespaces();
await checkPluginNamespaces();

console.log('\n' + '\u2500'.repeat(40));
if (errors === 0 && warnings === 0) {
  console.log('\x1b[32mAll checks passed.\x1b[0m\n');
} else {
  const parts: string[] = [];
  if (errors > 0) parts.push(`\x1b[31m${errors} error(s)\x1b[0m`);
  if (warnings > 0) parts.push(`\x1b[33m${warnings} warning(s)\x1b[0m`);
  console.log(parts.join(', ') + '\n');
}

process.exit(errors > 0 ? 1 : 0);
