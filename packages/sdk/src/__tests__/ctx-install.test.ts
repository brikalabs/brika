/**
 * `installVector` + `readInjectedVector` lock semantics. Verifies the
 * realm-lockdown contract: once installed, plugin code cannot overwrite
 * `globalThis.__brika_grants` via direct assignment, `defineProperty`, or
 * a forged Symbol-brand.
 *
 * These tests run in a fresh subprocess to avoid polluting the test
 * harness's globalThis (the lock is irreversible per design — that's the
 * whole point), so each behavioural case is exercised in its own
 * `bun --eval` shell.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

interface Outcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CTX_PATH = join(import.meta.dir, '..', 'ctx.ts');

async function runSnippet(snippet: string): Promise<Outcome> {
  const wrapped = `
    import { installVector, readInjectedVector, GRANTS_BRAND } from ${JSON.stringify(CTX_PATH)};
    try {
      ${snippet}
    } catch (e) {
      console.log('CAUGHT:' + (e instanceof Error ? e.message : String(e)));
    }
  `;
  const proc = Bun.spawn(['bun', '--eval', wrapped], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

describe('installVector', () => {
  test('a fresh process reading the vector before install throws a clear error', async () => {
    const out = await runSnippet(`
      readInjectedVector();
      console.log('SHOULD_NOT_REACH');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*Brika grant vector is not installed/);
    expect(out.stdout).not.toContain('SHOULD_NOT_REACH');
  });

  test('install + read round-trips the vector with the brand symbol', async () => {
    const out = await runSnippet(`
      installVector({ grants: [{ id: 'dev.brika.x.y', ctxPath: 'x.y' }] });
      const v = readInjectedVector();
      console.log('READ:' + JSON.stringify(v.grants));
      console.log('BRANDED:' + ((v as unknown as Record<symbol, unknown>)[GRANTS_BRAND] === true));
    `);
    expect(out.stdout).toContain('READ:[{"id":"dev.brika.x.y","ctxPath":"x.y"}]');
    expect(out.stdout).toContain('BRANDED:true');
  });

  test('second install throws a TypeError (cannot redefine non-configurable property)', async () => {
    const out = await runSnippet(`
      installVector({ grants: [] });
      installVector({ grants: [{ id: 'forged', ctxPath: 'forged' }] });
      console.log('SHOULD_NOT_REACH');
    `);
    expect(out.stdout).toContain('CAUGHT:');
    expect(out.stdout).not.toContain('SHOULD_NOT_REACH');
  });

  test('direct write to globalThis.__brika_grants is silently a no-op (writable:false)', async () => {
    const out = await runSnippet(`
      installVector({ grants: [{ id: 'real', ctxPath: 'real' }] });
      // In non-strict eval this silently fails; in strict it throws.
      // Reflect.set returns false on non-writable target instead of
      // throwing — gives us a uniform "no-op" assertion path regardless
      // of strict mode.
      Reflect.set(globalThis, '__brika_grants', {
        grants: [{ id: 'forged', ctxPath: 'forged' }],
      });
      const v = readInjectedVector();
      console.log('IDS:' + v.grants.map(g => g.id).join(','));
    `);
    expect(out.stdout).toContain('IDS:real');
    expect(out.stdout).not.toContain('forged');
  });

  test('Object.defineProperty against the locked slot throws TypeError', async () => {
    const out = await runSnippet(`
      installVector({ grants: [{ id: 'real', ctxPath: 'real' }] });
      Object.defineProperty(globalThis, '__brika_grants', { value: { grants: [{ id: 'forged', ctxPath: 'forged' }] } });
      console.log('SHOULD_NOT_REACH');
    `);
    expect(out.stdout).toContain('CAUGHT:');
    expect(out.stdout).not.toContain('SHOULD_NOT_REACH');
  });

  test('installVector rejects non-vector inputs with a clear TypeError', async () => {
    const out = await runSnippet(`
      installVector(null);
      console.log('SHOULD_NOT_REACH');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*installVector: expected/);
    expect(out.stdout).not.toContain('SHOULD_NOT_REACH');
  });
});
