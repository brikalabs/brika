/**
 * Lockdown unit-level coverage — mode parsing, write-key gating, and the
 * snapshot/integrity gate logic. Subprocess attacks live in
 * lockdown-redteam.test.ts; this file is for the cheap path.
 *
 * These tests run in a fresh subprocess each so the module-load side
 * effects (the actual scrub) don't leak into other tests.
 */

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

setDefaultTimeout(15_000);

const LOCKDOWN_PATH = join(import.meta.dir, 'runtime/plugins/prelude/lockdown.ts');

interface Outcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runWithLockdown(
  snippet: string,
  mode: 'enforce' | 'warn' | 'off' = 'enforce'
): Promise<Outcome> {
  const wrapped = `
    import * as lockdown from ${JSON.stringify(LOCKDOWN_PATH)};
    try {
      ${snippet}
    } catch (e) {
      console.log('CAUGHT:' + (e instanceof Error ? e.message : String(e)));
    }
  `;
  const tmp = mkdtempSync(join(tmpdir(), 'brika-lockdown-unit-'));
  const scriptPath = join(tmp, 'unit.ts');
  writeFileSync(scriptPath, wrapped, 'utf8');
  const proc = Bun.spawn(['bun', `--preload=${LOCKDOWN_PATH}`, scriptPath], {
    env: { ...process.env, BRIKA_LOCKDOWN_MODE: mode },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

describe('lockdown mode toggle', () => {
  test('default mode is enforce when env var is unset', async () => {
    const out = await runWithLockdown(`console.log('MODE:' + lockdown.getLockdownMode());`);
    expect(out.stdout).toContain('MODE:enforce');
  });

  test('explicit warn mode is honoured', async () => {
    const out = await runWithLockdown(`console.log('MODE:' + lockdown.getLockdownMode());`, 'warn');
    expect(out.stdout).toContain('MODE:warn');
  });

  test('off mode does not scrub fetch', async () => {
    const out = await runWithLockdown(
      `console.log('FETCH_TYPE:' + typeof globalThis.fetch);`,
      'off'
    );
    expect(out.stdout).toContain('FETCH_TYPE:function');
  });

  test('unknown mode falls back to enforce', async () => {
    const wrapped = `
      import * as lockdown from ${JSON.stringify(LOCKDOWN_PATH)};
      console.log('MODE:' + lockdown.getLockdownMode());
    `;
    const tmp = mkdtempSync(join(tmpdir(), 'brika-lockdown-fallback-'));
    const scriptPath = join(tmp, 'fallback.ts');
    writeFileSync(scriptPath, wrapped, 'utf8');
    const proc = Bun.spawn(['bun', `--preload=${LOCKDOWN_PATH}`, scriptPath], {
      env: { ...process.env, BRIKA_LOCKDOWN_MODE: 'completely-bogus' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    expect(stdout).toContain('MODE:enforce');
  });
});

describe('lockdown vector write-key', () => {
  test('installVectorV2 with the right key succeeds', async () => {
    const out = await runWithLockdown(`
      const key = lockdown.getVectorWriteKey();
      lockdown.installVectorV2({ grants: [{ id: 'real', ctxPath: 'real' }] }, key);
      console.log('OK');
    `);
    expect(out.stdout).toContain('OK');
    expect(out.stdout).not.toContain('CAUGHT:');
  });

  test('installVectorV2 with a forged key is rejected', async () => {
    const out = await runWithLockdown(`
      const forged = Symbol('not-the-real-key');
      lockdown.installVectorV2({ grants: [{ id: 'forged', ctxPath: 'forged' }] }, forged);
      console.log('LEAKED');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*invalid write key/);
    expect(out.stdout).not.toContain('LEAKED');
  });

  test('installVectorV2 with Symbol.for(same-name) is rejected (Symbol.for is forgeable)', async () => {
    const out = await runWithLockdown(`
      const forged = Symbol.for('brika.grants.write-key');
      lockdown.installVectorV2({ grants: [{ id: 'forged', ctxPath: 'forged' }] }, forged);
      console.log('LEAKED');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*invalid write key/);
    expect(out.stdout).not.toContain('LEAKED');
  });
});

describe('lockdown safe-process accessors', () => {
  test('getSafeProcessSend returns a function (or throws cleanly if process.send is missing)', async () => {
    const out = await runWithLockdown(`
      try {
        const send = lockdown.getSafeProcessSend();
        console.log('TYPE:' + typeof send);
      } catch (e) {
        console.log('NO_IPC:' + (e instanceof Error ? e.message : String(e)));
      }
    `);
    // Subprocess has no parent IPC channel — the helper throws with a
    // clear message in that case. Either branch is acceptable; what we
    // care about is that the accessor itself doesn't blow up.
    expect(out.stdout).toMatch(/TYPE:function|NO_IPC:lockdown:/);
  });

  test('getSafeProcessOn returns a function', async () => {
    const out = await runWithLockdown(`
      const on = lockdown.getSafeProcessOn();
      console.log('TYPE:' + typeof on);
    `);
    expect(out.stdout).toContain('TYPE:function');
  });
});

describe('lockdown integrity gate (assertSealed)', () => {
  test('returns null when no scrubbed global was tampered with', async () => {
    const out = await runWithLockdown(`
      const drift = lockdown.assertSealed();
      console.log('DRIFT:' + (drift === null ? 'null' : drift.length));
    `);
    expect(out.stdout).toContain('DRIFT:null');
  });

  test('detects post-lockdown tampering of a scrubbed global', async () => {
    const out = await runWithLockdown(`
      // Try to restore a real fetch — the scrub stub is writable:true so
      // the assignment goes through. assertSealed must catch the drift.
      const tampered = (...args) => 'tampered';
      try { globalThis.fetch = tampered; } catch { /* ignored */ }
      const drift = lockdown.assertSealed();
      console.log('DRIFT:' + JSON.stringify(drift));
    `);
    expect(out.stdout).toMatch(/DRIFT:\["globalThis\.fetch"\]/);
  });

  test('off mode short-circuits assertSealed to null', async () => {
    const out = await runWithLockdown(
      `
        const drift = lockdown.assertSealed();
        console.log('DRIFT:' + (drift === null ? 'null' : 'NOT_NULL'));
      `,
      'off'
    );
    expect(out.stdout).toContain('DRIFT:null');
  });
});
