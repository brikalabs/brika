/**
 * Subprocess-level test for `runSelfCheckAndExit`. The in-process
 * sibling (`self-check.exit.test.ts`) can only pin the export shape
 * because calling it would tear the test runner down; this file
 * forks Bun to exercise the *actual* write→callback→exit chain so
 * we catch stdout flush regressions.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SELF_CHECK_MODULE = resolve(import.meta.dir, 'self-check.ts');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'brika-self-check-sub-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface SubprocessOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runChild(scriptBody: string): Promise<SubprocessOutcome> {
  const scriptPath = join(dir, 'driver.ts');
  writeFileSync(scriptPath, scriptBody);
  const proc = Bun.spawn(['bun', 'run', scriptPath], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe('runSelfCheckAndExit (subprocess)', () => {
  test('writes a single JSON line then exits 0', async () => {
    const outcome = await runChild(
      `import { runSelfCheckAndExit } from ${JSON.stringify(SELF_CHECK_MODULE)};
       runSelfCheckAndExit();`
    );
    expect(outcome.exitCode).toBe(0);
    const lines = outcome.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? '');
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.version).toBe('string');
    expect(parsed.version.length).toBeGreaterThan(0);
  });

  test('the JSON line survives the exit (stdout drains before process exits)', async () => {
    // Regression guard for the original bug — without the write
    // callback, `process.exit` could fire before the stdout buffer
    // flushed and the parent would see an empty stdout.
    const outcome = await runChild(
      `import { runSelfCheckAndExit } from ${JSON.stringify(SELF_CHECK_MODULE)};
       runSelfCheckAndExit();`
    );
    expect(outcome.stdout.length).toBeGreaterThan(0);
    expect(outcome.stdout.endsWith('\n')).toBe(true);
  });
});
