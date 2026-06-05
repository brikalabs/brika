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
}

async function discoverWorkspaces(): Promise<Workspace[]> {
  const glob = new Glob('{apps,packages,plugins}/*/package.json');
  const out: Workspace[] = [];
  for await (const path of glob.scan('.')) {
    const pkg = await Bun.file(path).json();
    if (typeof pkg.scripts?.test === 'string') {
      out.push({ dir: dirname(path), name: pkg.name });
    }
  }
  return out;
}

async function runOne(ws: Workspace): Promise<number> {
  // Use the workspace's own `test` script (`bun run test`) so any
  // `--parallel` flag baked into that script is preserved; append the
  // coverage flags as positional args.
  const proc = Bun.spawn({
    cmd: ['bun', 'run', 'test', '--coverage', '--coverage-reporter=lcov', '--timeout=30000'],
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
