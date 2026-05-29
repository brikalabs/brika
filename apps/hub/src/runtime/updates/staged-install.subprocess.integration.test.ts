/**
 * Subprocess-level test for `runStagedSelfCheck`. Unit tests cover
 * the pure JSON parsing; this one exercises the *spawn / pipe / exit*
 * plumbing on a real Bun child so we catch:
 *
 *   - stdout flush race between `process.stdout.write` and
 *     `process.exit` (without the write callback this used to drop
 *     the JSON line on some Bun builds)
 *   - timeout enforcement
 *   - non-zero exit propagating as a thrown error
 *   - non-JSON stdout flagged as failure
 *
 * Each test writes a tiny bun script to a temp file, spawns it via
 * `runStagedSelfCheck`, and asserts the outcome.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStagedSelfCheck } from './staged-install';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'brika-selfcheck-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a tiny shim that pretends to be `brika.next --self-check`.
 * `runStagedSelfCheck` spawns the path as if it were the new binary,
 * so we hand it a shell script that just runs `bun -e <body>`.
 */
function writeFakeBinary(body: string): string {
  // Use bun directly as the interpreter — guaranteed available in
  // this test runner, and matches the real `brika` shape (compiled
  // bun binary).
  const path = join(dir, 'brika.next');
  writeFileSync(path, `#!/usr/bin/env bun\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe('runStagedSelfCheck (subprocess)', () => {
  test('returns the version when the probe writes {ok: true, version}', async () => {
    const bin = writeFakeBinary(
      `process.stdout.write(JSON.stringify({ ok: true, version: '9.9.9' }) + '\\n')`
    );
    const result = await runStagedSelfCheck(bin);
    expect(result.version).toBe('9.9.9');
  });

  test('throws when stdout is not JSON', async () => {
    const bin = writeFakeBinary(`process.stdout.write('not json at all\\n')`);
    await expect(runStagedSelfCheck(bin)).rejects.toThrow(/not JSON/);
  });

  test('throws when the probe exits non-zero', async () => {
    const bin = writeFakeBinary(`process.stderr.write('boom'); process.exit(42)`);
    await expect(runStagedSelfCheck(bin)).rejects.toThrow(/exited with code 42/);
  });

  test('throws when the probe reports {ok: false}', async () => {
    const bin = writeFakeBinary(
      `process.stdout.write(JSON.stringify({ ok: false, version: '' }) + '\\n')`
    );
    await expect(runStagedSelfCheck(bin)).rejects.toThrow(/non-ok/);
  });

  test('times out when the probe hangs longer than the limit', async () => {
    // The probe's deadline is 5 s; sleep longer than that. Bun.spawn
    // sends SIGTERM on timeout, exit code is non-zero.
    const bin = writeFakeBinary(`await new Promise(r => setTimeout(r, 10_000))`);
    await expect(runStagedSelfCheck(bin)).rejects.toThrow(/exited with code/);
  }, 10_000);
});
