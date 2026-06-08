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

/**
 * Compute the set of 1-based line numbers in `relPath` that can never carry
 * executable code: blank lines, `//` and `/* … *​/` comments (incl. JSDoc
 * continuation `*` lines), and pure-punctuation lines (a lone `}`, `});`,
 * `);`, …). Block-comment state is tracked across lines; a line that closes a
 * block comment and then continues with real code is kept as code.
 */
const PUNCT_ONLY = /^[{}()[\];,]+$/;

/** Whether the text trailing a block-comment close (`*​/`) holds real code. */
function hasCodeAfterClose(rest: string): boolean {
  const t = rest.trim();
  return t.length > 0 && !t.startsWith('//') && !t.startsWith('/*');
}

async function nonCodeLines(relPath: string): Promise<Set<number>> {
  const nc = new Set<number>();
  let source: string;
  try {
    source = await Bun.file(relPath).text();
  } catch {
    return nc;
  }
  let inBlock = false;
  source.split('\n').forEach((raw, i) => {
    const ln = i + 1;
    const s = raw.trim();
    if (inBlock) {
      const close = s.indexOf('*/');
      inBlock = close === -1;
      if (inBlock || !hasCodeAfterClose(s.slice(close + 2))) {
        nc.add(ln);
      }
      return;
    }
    if (s.length === 0 || s.startsWith('//') || s.startsWith('*') || PUNCT_ONLY.test(s)) {
      nc.add(ln);
      return;
    }
    if (s.startsWith('/*')) {
      const close = s.indexOf('*/');
      inBlock = close === -1;
      if (inBlock || !hasCodeAfterClose(s.slice(close + 2))) {
        nc.add(ln);
      }
    }
  });
  return nc;
}

/**
 * bun's `--parallel` coverage instrumentation spuriously emits `DA:line,0`
 * records for non-executable lines (comments, blanks, lone closers) that a
 * single-threaded run correctly omits. SonarCloud reads those as uncovered
 * new lines, so heavily-commented new code reads as poorly covered even when
 * every statement is exercised. Drop the 0-hit records on provably non-code
 * lines and recompute each file's LF/LH; real uncovered code (0-hit on a
 * statement line) is preserved untouched. Returns the count dropped.
 */
async function stripSpuriousZeroHits(dest: string): Promise<number> {
  const text = await Bun.file(dest).text();
  const cache = new Map<string, Set<number>>();
  const out: string[] = [];
  let currentFile: string | null = null;
  let da: Array<[number, number]> = [];
  let dropped = 0;
  const flush = () => {
    if (da.length > 0) {
      out.push(`LF:${da.length}`, `LH:${da.filter(([, h]) => h > 0).length}`);
    }
    da = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3);
      out.push(line);
    } else if (line.startsWith('DA:') && currentFile) {
      const [lnStr, hitStr] = line.slice(3).split(',');
      const ln = Number(lnStr);
      const hits = Number(hitStr);
      if (hits === 0) {
        let nc = cache.get(currentFile);
        if (!nc) {
          nc = await nonCodeLines(currentFile);
          cache.set(currentFile, nc);
        }
        if (nc.has(ln)) {
          dropped++;
          continue;
        }
      }
      da.push([ln, hits]);
      out.push(line);
    } else if (line.startsWith('LF:') || line.startsWith('LH:')) {
      // Recomputed from the surviving DA records at end_of_record.
    } else if (line.startsWith('end_of_record')) {
      flush();
      out.push(line);
      currentFile = null;
    } else if (line.length > 0) {
      out.push(line);
    }
  }
  await Bun.write(dest, `${out.join('\n')}\n`);
  return dropped;
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

const stripped = await stripSpuriousZeroHits('coverage/lcov.info');
console.log(`stripped ${stripped} spurious 0-hit non-code DA records`);

process.exit(worstExit);
