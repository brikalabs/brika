/**
 * `brika check`: validate a plugin without publishing.
 *
 * Runs the static manifest checks (formerly the standalone brika-verify-plugin
 * bin) plus a server/browser import-boundary scan: browser modules (bricks,
 * pages) may only import the specifiers the host bridges to globalThis.__brika.*
 * (the single allowlist exported from the compiler). Importing a server-only
 * @brika/sdk subpath into a brick is caught here, at author time, instead of by
 * a runtime stub that throws once the brick renders.
 *
 * Drift between source and the committed manifest/entry is the job of
 * `brika build --check`; CI should run both.
 */

import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import { browserAllowedSpecifiers } from '@brika/compiler';
import pc from 'picocolors';
import { verifyPlugin } from '../../src/verify-plugin';
import { i18nUsageDiagnostics } from '../i18n-usage';

export interface Violation {
  file: string;
  specifier: string;
}

/** Scan one browser module's imports for server-only specifiers. */
async function scanFile(file: string, allowed: ReadonlySet<string>): Promise<Violation[]> {
  const source = await readFile(file, 'utf8');
  const { imports } = new Bun.Transpiler({ loader: 'tsx' }).scan(source);
  const violations: Violation[] = [];
  for (const imported of imports) {
    // Only @brika/sdk subpaths are gated; react/lucide/clsx/cva and relative
    // imports are fine. A bridged specifier is allowed; anything else under
    // @brika/sdk is server-only and must not reach the browser bundle.
    if (imported.path.startsWith('@brika/sdk') && !allowed.has(imported.path)) {
      violations.push({ file, specifier: imported.path });
    }
  }
  return violations;
}

/** Scan every brick/page module under the plugin for boundary violations. */
export async function scanBoundary(root: string): Promise<Violation[]> {
  const allowed = browserAllowedSpecifiers();
  const files: string[] = [];
  for (const pattern of ['src/bricks/*.tsx', 'src/pages/*.tsx']) {
    try {
      for await (const rel of new Bun.Glob(pattern).scan({ cwd: root })) {
        if (!basename(rel).startsWith('_')) {
          files.push(join(root, rel));
        }
      }
    } catch {
      // Directory may not exist.
    }
  }
  const perFile = await Promise.all(files.map((f) => scanFile(f, allowed)));
  return perFile.flat();
}

/**
 * Type-check the plugin with the repo's `tsgo` (resolved from the plugin's own
 * deps, since a CLI doesn't inherit node_modules/.bin on PATH). Returns ok=true
 * and skips with a warning if no typechecker is installed, so `brika check`
 * stays usable in environments that don't ship one.
 */
async function runTypecheck(root: string): Promise<boolean> {
  let tsgoBin: string | undefined;
  try {
    const pkgJsonPath = Bun.resolveSync('@typescript/native-preview/package.json', root);
    const pkg: { bin?: string | Record<string, string> } = await Bun.file(pkgJsonPath).json();
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.tsgo;
    if (binRel) {
      tsgoBin = join(dirname(pkgJsonPath), binRel);
    }
  } catch {
    // No typechecker resolvable from the plugin; fall through to the skip.
  }
  if (!tsgoBin) {
    process.stderr.write(
      `  ${pc.yellow('warn')} typecheck skipped: @typescript/native-preview not found\n`
    );
    return true;
  }
  const proc = Bun.spawn(['bun', tsgoBin, '--noEmit'], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return (await proc.exited) === 0;
}

async function resolveSdkVersion(): Promise<string> {
  const here = new URL('../../../../packages/sdk/package.json', import.meta.url);
  try {
    const raw: Record<string, unknown> = JSON.parse(await readFile(here, 'utf8'));
    return typeof raw.version === 'string' ? raw.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default defineCommand({
  name: 'check',
  description: 'Validate a plugin: types + manifest checks + server/browser import-boundary scan',
  details:
    'The single static gate: type-checks the plugin, runs the manifest checks, and flags any ' +
    'brick/page importing a server-only @brika/sdk subpath. Use --types for a types-only pass ' +
    '(what the `typecheck` script runs). Pair with `brika build --check` (the manifest drift gate) in CI.',
  options: {
    dir: { type: 'string', description: 'Plugin directory (default: current directory)' },
    types: {
      type: 'boolean',
      description: 'Type-check only (skip manifest + import-boundary checks)',
    },
  },
  examples: ['brika check', 'brika check --types', 'brika check --dir plugins/timer'],
  async handler({ values }) {
    const root = resolve(values.dir ?? process.cwd());

    const typesOk = await runTypecheck(root);
    if (values.types) {
      if (!typesOk) {
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`${pc.green('✓')} types OK\n`);
      return;
    }

    const [result, violations, usage] = await Promise.all([
      verifyPlugin(root, await resolveSdkVersion()),
      scanBoundary(root),
      i18nUsageDiagnostics(root),
    ]);

    for (const warning of [...result.warnings, ...usage.warnings]) {
      process.stderr.write(`  ${pc.yellow('warn')} ${warning}\n`);
    }
    for (const error of [...result.errors, ...usage.errors]) {
      process.stderr.write(`  ${pc.red('error')} ${error}\n`);
    }
    for (const v of violations) {
      process.stderr.write(
        `  ${pc.red('error')} ${pc.dim(v.file)}: imports server-only ${pc.bold(v.specifier)} in a browser module\n`
      );
    }

    if (!typesOk || !result.passed || violations.length > 0 || usage.errors.length > 0) {
      process.stderr.write(pc.red('\nbrika check failed.\n'));
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${pc.green('✓')} ${result.name} passed checks\n`);
  },
});
