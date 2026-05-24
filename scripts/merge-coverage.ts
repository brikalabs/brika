#!/usr/bin/env bun
/**
 * Merge every workspace's `coverage/lcov.info` into one repo-relative
 * report at `coverage/lcov.info`. Used by CI before the Sonar scan.
 *
 * Per-workspace `bun test --coverage` writes `SF:` paths relative to
 * the workspace's own cwd, so we prefix with the workspace dir and
 * collapse any `..` segments via `path.relative` to get a single
 * fully-repo-relative report.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { Glob } from 'bun';

const dest = 'coverage/lcov.info';
const root = process.cwd();

await mkdir('coverage', { recursive: true });

const out: string[] = [];
for await (const lcov of new Glob('**/coverage/lcov.info').scan('.')) {
  if (lcov === dest) {
    continue;
  }
  const ws = resolve(lcov, '../..');
  const text = await readFile(lcov, 'utf8');
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      out.push(`SF:${relative(root, resolve(ws, line.slice(3)))}`);
    } else if (line.length > 0) {
      out.push(line);
    }
  }
}

await writeFile(dest, `${out.join('\n')}\n`);
console.log(`merged ${out.filter((l) => l.startsWith('SF:')).length} source files into ${dest}`);
