/// <reference types="bun-types" />

/**
 * CLI: Generate typed i18next resource declarations from English translation files.
 *
 * Usage: bun packages/i18n-dev/src/generate-types.ts [--locales <dir>] [--out <dir>]
 */

import { findWorkspaceRoot } from '@brika/i18n/node';
import { join } from 'node:path';
import {
  generateNamespaceList,
  generateRegistryAugmentation,
  generateResourceTypes,
} from './generate';
import { isPlainObject } from './object';

function cliFlag(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return (idx >= 0 ? process.argv[idx + 1] : undefined) ?? fallback;
}

const CWD = process.cwd();
// Run with `bun --filter <pkg>` sets cwd to the filtered package; auto-discover
// the workspace root so default paths resolve to repo locations either way.
const ROOT = (await findWorkspaceRoot(CWD)) ?? CWD;
const LOCALES_DIR = cliFlag('--locales', join(ROOT, 'apps/hub/src/locales/en'));
const OUT_DIR = cliFlag('--out', join(ROOT, 'node_modules/.cache/@brika/i18n-devtools'));
const REGISTRY_MODULE = cliFlag('--module', '@brika/i18n/registry');

// ─── Read namespaces ─────────────────────────────────────────────────────────

const glob = new Bun.Glob('*.json');
const namespaces: Array<{ name: string; content: Record<string, unknown> }> = [];

for await (const file of glob.scan({ cwd: LOCALES_DIR })) {
  const name = file.replace('.json', '');
  const content: unknown = await Bun.file(join(LOCALES_DIR, file)).json();
  if (!isPlainObject(content)) {
    console.warn(`! Skipping ${file}: JSON root is not an object`);
    continue;
  }
  namespaces.push({ name, content });
}

namespaces.sort((a, b) => a.name.localeCompare(b.name));

// ─── Write output ────────────────────────────────────────────────────────────

const typesPath = join(OUT_DIR, 'i18n-resources.d.ts');
const nsPath = join(OUT_DIR, 'i18n-namespaces.ts');
const registryPath = join(OUT_DIR, 'i18n-registry.d.ts');

await Bun.write(typesPath, generateResourceTypes(namespaces));
await Bun.write(nsPath, generateNamespaceList(namespaces.map((n) => n.name)));
await Bun.write(
  registryPath,
  generateRegistryAugmentation(namespaces, { module: REGISTRY_MODULE })
);

// ─── Summary ─────────────────────────────────────────────────────────────────

const rel = (p: string) => p.replace(`${ROOT}/`, '');
console.log(`✓ Generated ${rel(typesPath)} (${namespaces.length} namespaces)`);
console.log(`✓ Generated ${rel(nsPath)}`);
console.log(`✓ Generated ${rel(registryPath)}`);
