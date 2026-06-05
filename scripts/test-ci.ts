#!/usr/bin/env bun
/**
 * CI test runner. Fans every workspace's `bun test` out across the
 * runner's cores, captures per-workspace output under `::group::`
 * markers, merges the resulting lcov files, and exits with the
 * worst exit code so a single failed workspace still fails CI.
 */

import { dirname, relative, resolve } from 'node:path';
import { Glob } from 'bun';

const CONCURRENCY = 4;

interface Workspace {
  readonly dir: string;
  readonly name: string;
  readonly testArgs: string[];
}

/**
 * Extract a workspace `test` script's positional args (e.g. the path filters
 * in `@brika/ui`'s `bun test src/lib ...`), dropping the `bun test` prefix and
 * any `--parallel`. We deliberately strip `--parallel`: bun's parallel runner
 * collects coverage per worker and merges it, and on a many-core CI host that
 * merge non-deterministically drops line hits, so a fully-tested file can be
 * reported well under 80% new-code coverage. Running the coverage pass serially
 * keeps a single coverage context, so the lcov matches what the tests actually
 * exercise. (Local dev still uses the parallel `bun test` for speed.)
 */
function parseTestArgs(script: string): string[] {
  return script
    .replace(/^\s*bun\s+test\s*/, '')
    .split(/\s+/)
    .filter((arg) => arg.length > 0 && arg !== '--parallel');
}

async function discoverWorkspaces(): Promise<Workspace[]> {
  const glob = new Glob('{apps,packages,plugins}/*/package.json');
  const out: Workspace[] = [];
  for await (const path of glob.scan('.')) {
    const pkg = await Bun.file(path).json();
    if (typeof pkg.scripts?.test === 'string') {
      out.push({ dir: dirname(path), name: pkg.name, testArgs: parseTestArgs(pkg.scripts.test) });
    }
  }
  return out;
}

async function runOne(ws: Workspace): Promise<number> {
  // Run `bun test` directly (not `bun run test`) with the script's own
  // positional args but WITHOUT `--parallel` (see parseTestArgs for why a
  // serial coverage pass is required for accurate lcov on CI).
  const proc = Bun.spawn({
    cmd: [
      'bun',
      'test',
      ...ws.testArgs,
      '--coverage',
      '--coverage-reporter=lcov',
      '--timeout=30000',
    ],
    cwd: ws.dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  process.stdout.write(`::group::${ws.name} (exit=${exitCode})\n`);
  process.stdout.write(stdout);
  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }
  process.stdout.write('::endgroup::\n');
  return exitCode;
}

async function mergeLcov(): Promise<number> {
  const dest = 'coverage/lcov.info';
  const root = process.cwd();
  await Bun.write(dest, '');
  const file = Bun.file(dest).writer();
  let count = 0;
  for await (const lcov of new Glob('**/coverage/lcov.info').scan('.')) {
    if (lcov === dest) {
      continue;
    }
    const ws = resolve(lcov, '../..');
    const text = await Bun.file(lcov).text();
    for (const line of text.split('\n')) {
      if (line.startsWith('SF:')) {
        file.write(`SF:${relative(root, resolve(ws, line.slice(3)))}\n`);
        count++;
      } else if (line.length > 0) {
        file.write(`${line}\n`);
      }
    }
  }
  await file.end();
  return count;
}

const workspaces = await discoverWorkspaces();
console.log(`running ${workspaces.length} workspaces with concurrency=${CONCURRENCY}`);

let worstExit = 0;
const queue = [...workspaces];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const ws = queue.shift();
    if (!ws) {
      return;
    }
    const ec = await runOne(ws);
    if (ec !== 0 && worstExit === 0) {
      worstExit = ec;
    }
  }
});
await Promise.all(workers);

const merged = await mergeLcov();
console.log(`merged ${merged} source files into coverage/lcov.info`);

process.exit(worstExit);
