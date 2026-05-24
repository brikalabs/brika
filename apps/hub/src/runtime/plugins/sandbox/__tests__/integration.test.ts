/**
 * End-to-end integration test for the macOS sandbox launcher.
 *
 * Spawns a real `sandbox-exec` + `bun` process with a profile that
 * permits writing one specific dir and verifies:
 *   1. A WRITE inside the writableDirs succeeds
 *   2. A WRITE outside writableDirs fails (kernel refuses)
 *
 * Reads aren't tested here — the v1 profile permits `file-read*`
 * broadly so Bun's runtime can start; the L2 grant vector enforces
 * what plugin code can actually access via `ctx.fs.readFile`. The
 * L3 security contract is the WRITE boundary, which is what we
 * verify below.
 *
 * Skipped on non-macOS / when sandbox-exec is missing.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { macosLauncher } from '../macos-launcher';
import type { SandboxProfile } from '../types';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const skip = process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC);

describe('macOS sandbox-exec integration', () => {
  test.skipIf(skip)('writes inside writableDirs succeed; writes outside fail', async () => {
    // `allowed` lives under tmpdir() (which is under /private/var/folders
    // on macOS) — the SBPL baseline already permits writes there for
    // Bun's runtime, but we still ALSO whitelist it in `writableDirs`
    // to confirm the explicit allow makes it into the profile.
    const allowed = mkdtempSync(join(tmpdir(), 'brika-sandbox-allowed-'));
    // `denied` lives at a path the runtime baseline does NOT cover:
    // we write to the worktree's own dir. Without an explicit scope
    // rule the kernel denies the write.
    const denied = mkdtempSync(join(process.cwd(), '.brika-sandbox-denied-'));
    try {
      const profile: SandboxProfile = {
        pluginUid: 'integration-test',
        readableDirs: [],
        writableDirs: [allowed],
        allowNetwork: false,
      };

      // The snippet runs inside the sandbox. We attempt to write to
      // both dirs and report which write succeeded. The kernel
      // should permit the allowed write and reject the denied one.
      const insidePath = join(allowed, 'inside.txt');
      const outsidePath = join(denied, 'outside.txt');
      const snippet = `
        let insideOk = '';
        let outsideOk = '';
        try {
          require('node:fs').writeFileSync(${JSON.stringify(insidePath)}, 'WROTE_INSIDE');
          insideOk = 'OK';
        } catch (e) { insideOk = 'ERR:' + (e.code || e.message); }
        try {
          require('node:fs').writeFileSync(${JSON.stringify(outsidePath)}, 'WROTE_OUTSIDE');
          outsideOk = 'OK';
        } catch (e) { outsideOk = 'ERR:' + (e.code || e.message); }
        console.log(JSON.stringify({ insideOk, outsideOk }));
      `;

      const plan = macosLauncher.wrap(process.execPath, ['-e', snippet], profile);
      const proc = Bun.spawn([plan.cmd, ...plan.args], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const jsonLine = stdout.split('\n').find((line) => line.startsWith('{'));
      if (!jsonLine) {
        throw new Error(
          `no JSON line in output. exit=${proc.exitCode}\nstdout=${stdout}\nstderr=${stderr}`
        );
      }
      const parsed = JSON.parse(jsonLine);
      // Inside write must have gone through.
      expect(parsed.insideOk).toBe('OK');
      // Outside write must have been refused by the kernel.
      expect(parsed.outsideOk).toMatch(/^ERR:/);
      // The file actually exists where it should and not where it shouldn't.
      expect(readFileSync(insidePath, 'utf-8')).toBe('WROTE_INSIDE');
      expect(existsSync(outsidePath)).toBe(false);
    } finally {
      try {
        rmSync(allowed, { recursive: true, force: true });
        rmSync(denied, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });
});
