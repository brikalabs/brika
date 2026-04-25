#!/usr/bin/env bun
/**
 * Codegen entry point. Reads `src/tokens/registry.ts` and writes
 *
 *   src/styles/tokens-roles.css       — Layer 0 + 1
 *   src/styles/tokens-components.css  — Layer 2 fallback chains
 *
 * Run via `pnpm --filter @brika/clay build:tokens`. Hand-editing the
 * generated CSS is a bug — fix the registry instead.
 *
 * The pure render functions live in `./build-tokens-emit.ts` and are
 * unit-tested.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOKEN_REGISTRY } from '../src/tokens/registry';
import { renderRolesCss, renderComponentsCss } from './build-tokens-emit';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const STYLES_DIR = join(PACKAGE_ROOT, 'src', 'styles');

function writeFile(relPath: string, contents: string): void {
  const target = join(STYLES_DIR, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[build-tokens] wrote ${relPath} (${contents.length} bytes)`);
}

writeFile('tokens-roles.css', renderRolesCss(TOKEN_REGISTRY));
writeFile('tokens-components.css', renderComponentsCss(TOKEN_REGISTRY));
