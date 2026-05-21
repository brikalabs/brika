/// <reference types="bun-types" />

/**
 * CLI: Generate typed i18next resource declarations from a reference-locale folder.
 *
 * Usage: bun packages/i18n-dev/src/generate-types.ts \
 *          [--locales <dir>] [--reference-locale <locale>] [--out <dir>] \
 *          [--module <module-id>] [--default-namespace <ns>]
 */

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
const REFERENCE_LOCALE = cliFlag('--reference-locale', 'en');
const LOCALES_DIR = cliFlag('--locales', join(CWD, 'src/locales', REFERENCE_LOCALE));
const OUT_DIR = cliFlag('--out', join(CWD, 'node_modules/.cache/@brika/i18n-devtools'));
const REGISTRY_MODULE = cliFlag('--module', '@brika/i18n/registry');
const DEFAULT_NAMESPACE = cliFlag('--default-namespace', 'translation');

// ─── Read namespaces ─────────────────────────────────────────────────────────

const glob = new Bun.Glob('*.json');
const namespaces: Array<{ name: string; content: Record<string, unknown> }> = [];

let scanIterator: AsyncIterableIterator<string>;
try {
  scanIterator = glob.scan({ cwd: LOCALES_DIR })[Symbol.asyncIterator]();
} catch {
  console.log(`No locales found at ${LOCALES_DIR} — nothing to generate.`);
  process.exit(0);
}

for (;;) {
  const next = await scanIterator.next().catch(() => ({ done: true, value: undefined }) as const);
  if (next.done) {
    break;
  }
  const file = next.value;
  if (typeof file !== 'string') {
    continue;
  }
  const name = file.replace('.json', '');
  const content: unknown = await Bun.file(join(LOCALES_DIR, file)).json();
  if (!isPlainObject(content)) {
    console.warn(`! Skipping ${file}: JSON root is not an object`);
    continue;
  }
  namespaces.push({ name, content });
}

if (namespaces.length === 0) {
  console.log(`No JSON files found at ${LOCALES_DIR} — nothing to generate.`);
  process.exit(0);
}

namespaces.sort((a, b) => a.name.localeCompare(b.name));

// ─── Write output ────────────────────────────────────────────────────────────

const typesPath = join(OUT_DIR, 'i18n-resources.d.ts');
const nsPath = join(OUT_DIR, 'i18n-namespaces.ts');
const registryPath = join(OUT_DIR, 'i18n-registry.d.ts');

await Bun.write(typesPath, generateResourceTypes(namespaces));
await Bun.write(
  nsPath,
  generateNamespaceList(
    namespaces.map((n) => n.name),
    DEFAULT_NAMESPACE
  )
);
await Bun.write(
  registryPath,
  generateRegistryAugmentation(namespaces, { module: REGISTRY_MODULE })
);

// ─── Summary ─────────────────────────────────────────────────────────────────

const rel = (p: string) => (p.startsWith(`${CWD}/`) ? p.slice(CWD.length + 1) : p);
console.log(`✓ Generated ${rel(typesPath)} (${namespaces.length} namespaces)`);
console.log(`✓ Generated ${rel(nsPath)}`);
console.log(`✓ Generated ${rel(registryPath)}`);
