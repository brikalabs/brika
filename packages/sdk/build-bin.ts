/**
 * Bundle the `brika` author CLI into a single self-contained file.
 *
 * The build toolchain (@brika/compiler, @brika/cli, @brika/schema, picocolors)
 * is a devDependency, inlined here, so it never enters a plugin's install
 * closure: a plugin's only dependency stays @brika/sdk. @brika/sdk itself is
 * external (the bin runs from inside the installed package), and the native
 * typechecker (@typescript/native-preview) is spawned, never bundled.
 */

import { chmodSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findWorkspaceRoot } from './src/exec-context';

const result = await Bun.build({
  entrypoints: [`${import.meta.dir}/src/cli/brika.ts`],
  outdir: `${import.meta.dir}/dist/bin`,
  target: 'bun',
  // brika:embedded-cli is the compiled-binary delegation module; the lean bin
  // never runs compiled, so the dynamic import stays dormant and unresolved.
  external: ['@brika/sdk', '@typescript/native-preview', 'brika:embedded-cli'],
  banner: '#!/usr/bin/env bun',
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(String(log));
  }
  process.exit(1);
}

/**
 * `bun install --frozen-lockfile` links a workspace package's bin BEFORE running
 * its `prepare` script, so the dist/bin/brika.js this build just produced is
 * never linked into node_modules/.bin. Recreate the symlink the package's `bin`
 * field promises, so a sibling plugin's `brika check --types` resolves the CLI.
 * Idempotent and scoped to the monorepo root: a published install has its bin
 * linked by the package manager and never runs this build.
 */
function linkWorkspaceBin(): void {
  const root = findWorkspaceRoot({ cwd: import.meta.dir });
  if (!root) {
    return;
  }
  const target = join(import.meta.dir, 'dist', 'bin', 'brika.js');
  chmodSync(target, 0o755);
  const binDir = join(root, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  const link = join(binDir, 'brika');
  rmSync(link, { force: true });
  symlinkSync(relative(binDir, target), link);
}

linkWorkspaceBin();
console.log(`✓ built ${result.outputs.map((o) => o.path.split('/').pop()).join(', ')}`);
