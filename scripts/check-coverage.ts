#!/usr/bin/env bun
/**
 * Per-package coverage gate.
 *
 * Bun 1.3.14's `coverageThreshold` setting in `bunfig.toml` is documented
 * but not yet enforced by the runner. Until upstream lands the check, this
 * script provides the gate the CI relies on:
 *
 *   1. For every package in `packages/`, run `bun test --coverage`.
 *   2. Read the per-file rows in the text report.
 *   3. Aggregate the rows whose path starts with `src/` (the package's own
 *      source — transitive imports from `../testing`, `../errors`, etc.
 *      are excluded because they're gated in their own package).
 *   4. Fail if any package's aggregate `% Funcs` or `% Lines` < threshold.
 *
 * Threshold defaults to 0.80 (mirrors `bunfig.toml`) and can be overridden:
 *
 *   bun scripts/check-coverage.ts                 # 0.80
 *   bun scripts/check-coverage.ts --threshold=0.85
 *   bun scripts/check-coverage.ts --threshold=0.75 --skip=packages/i18n-dev
 *
 * Multiple --skip flags are allowed. Skipped packages still run their
 * tests; their numbers just don't gate the run.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();

/**
 * Default exemptions — packages whose own files we deliberately don't gate.
 * Keep in sync with `coverageSkipSourceFiles` in `bunfig.toml`.
 */
const DEFAULT_EXEMPT: ReadonlyArray<string> = [
  'apps/ui',
  'apps/docs',
  'apps/schema-cdn',
  'apps/build',
  'apps/console',
  'packages/tui',
  // Build-time asset-embedding macros; exercised by the hub build.
  'packages/embed',
];

function parseArgs(argv: ReadonlyArray<string>): { threshold: number; skip: Set<string> } {
  let threshold = 0.8;
  const skip = new Set(DEFAULT_EXEMPT);
  for (const a of argv) {
    if (a.startsWith('--threshold=')) {
      const n = Number(a.slice('--threshold='.length));
      if (Number.isFinite(n) && n > 0 && n <= 1) {
        threshold = n;
      }
    } else if (a.startsWith('--skip=')) {
      skip.add(a.slice('--skip='.length));
    } else if (a === '--no-default-skip') {
      // Escape hatch: also gate the exempt packages.
      for (const p of DEFAULT_EXEMPT) {
        skip.delete(p);
      }
    }
  }
  return { threshold, skip };
}

async function listPackages(): Promise<string[]> {
  const out: string[] = [];
  for (const dirName of ['packages', 'apps']) {
    let entries: string[];
    try {
      entries = await readdir(join(process.cwd(), dirName));
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dirName, name);
      let s: Awaited<ReturnType<typeof stat>>;
      try {
        s = await stat(join(full, 'package.json'));
      } catch {
        continue;
      }
      if (s.isFile()) {
        out.push(full);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

type Aggregate = {
  files: number;
  funcs: number;
  lines: number;
};

function parseCoverage(text: string): Aggregate | null {
  let files = 0;
  let funcs = 0;
  let lines = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.startsWith(' src/')) {
      continue;
    }
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 3) {
      continue;
    }
    const f = Number(cells[1]);
    const l = Number(cells[2]);
    if (!(Number.isFinite(f) && Number.isFinite(l))) {
      continue;
    }
    files += 1;
    funcs += f;
    lines += l;
  }
  if (files === 0) {
    return null;
  }
  return { files, funcs: funcs / files, lines: lines / files };
}

async function coverageFor(pkg: string): Promise<Aggregate | null> {
  const proc = Bun.spawn(['bun', 'test', '--coverage'], {
    cwd: join(root, pkg),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return parseCoverage(`${out}\n${err}`);
}

type Row = { pkg: string; agg: Aggregate | null; skipped: boolean };

function printRow(row: Row, thresholdPct: number): boolean {
  const { pkg, agg, skipped } = row;
  if (skipped) {
    console.log(`  ${pkg.padEnd(34)}  skipped`);
    return true;
  }
  if (!agg) {
    console.log(`  ${pkg.padEnd(34)}  no src/ files`);
    return true;
  }
  const ok = agg.funcs >= thresholdPct && agg.lines >= thresholdPct;
  const mark = ok ? '✓' : '✗';
  console.log(
    `  ${pkg.padEnd(34)}  ${mark} funcs=${agg.funcs.toFixed(1).padStart(5)}  lines=${agg.lines.toFixed(1).padStart(5)}  (${agg.files} files)`
  );
  return ok;
}

async function main() {
  const { threshold, skip } = parseArgs(process.argv.slice(2));
  const thresholdPct = threshold * 100;
  const packages = await listPackages();

  console.log(`\nCoverage gate: per-package src/ files ≥ ${thresholdPct.toFixed(1)}%\n`);

  const rows: Row[] = [];
  for (const pkg of packages) {
    const skipped = skip.has(pkg);
    const agg = skipped ? null : await coverageFor(pkg);
    rows.push({ pkg, agg, skipped });
  }

  const failed: string[] = [];
  for (const row of rows) {
    if (!printRow(row, thresholdPct)) {
      failed.push(row.pkg);
    }
  }

  if (failed.length > 0) {
    console.log(`\n${failed.length} package(s) below ${thresholdPct.toFixed(1)}%:`);
    for (const f of failed) {
      console.log(`  - ${relative(root, f)}`);
    }
    process.exit(1);
  }
  console.log(`\nAll packages at ${thresholdPct.toFixed(1)}% or above.\n`);
}

await main();
