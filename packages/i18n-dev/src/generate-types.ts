/// <reference types="bun-types" />

/**
 * CLI: Generate typed i18next resource declarations from English translation files.
 *
 * Usage: bun packages/i18n-dev/src/generate-types.ts [--locales <dir>] [--out <dir>]
 */

import { join } from 'node:path';
import { cliFlag } from './cli-utils';
import { generateNamespaceList, generateResourceTypes } from './generate';

const ROOT = process.cwd();
const LOCALES_DIR = cliFlag('--locales', join(ROOT, 'apps/hub/src/locales/en'));
const OUT_DIR = cliFlag('--out', join(ROOT, 'node_modules/.cache/@brika/i18n-devtools'));

// ─── Read namespaces ─────────────────────────────────────────────────────────

const glob = new Bun.Glob('*.json');
const namespaces: Array<{ name: string; content: Record<string, unknown> }> = [];

for await (const file of glob.scan({ cwd: LOCALES_DIR })) {
  const name = file.replace('.json', '');
  const content = (await Bun.file(join(LOCALES_DIR, file)).json()) as Record<string, unknown>;
  namespaces.push({ name, content });
}

namespaces.sort((a, b) => a.name.localeCompare(b.name));

// ─── Write output ────────────────────────────────────────────────────────────

const typesPath = join(OUT_DIR, 'i18n-resources.d.ts');
const nsPath = join(OUT_DIR, 'i18n-namespaces.ts');

await Bun.write(typesPath, generateResourceTypes(namespaces));
await Bun.write(nsPath, generateNamespaceList(namespaces.map((n) => n.name)));

// ─── Summary ─────────────────────────────────────────────────────────────────

const rel = (p: string) => p.replace(`${ROOT}/`, '');
console.log(`\u2713 Generated ${rel(typesPath)} (${namespaces.length} namespaces)`);
console.log(`\u2713 Generated ${rel(nsPath)}`);
