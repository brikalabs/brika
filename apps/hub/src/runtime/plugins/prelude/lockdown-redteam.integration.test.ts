/**
 * Red-team coverage for the prelude lockdown.
 *
 * Spawns a fresh Bun subprocess with the lockdown loaded and runs each
 * documented escape vector. Any attack that succeeds means a hole the
 * lockdown was supposed to close. This test IS the security contract —
 * if you change the scrub list in lockdown.ts, mirror the change here.
 *
 * Subprocess approach is deliberate: the scrubs are irreversible by
 * design, so running attacks in-process would pollute the test harness's
 * own realm and make every later test see scrubbed globals.
 */

import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Subprocess spawn is slow under parallel load.
setDefaultTimeout(20_000);

const LOCKDOWN_PATH = join(import.meta.dir, 'lockdown.ts');

interface AttackResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run an attack snippet in a fresh subprocess with the lockdown
 * **preloaded** (`--preload=lockdown.ts`). Bun.plugin's module-loader
 * deny-list only intercepts resolutions issued after `Bun.plugin(...)`
 * is called; if the lockdown were loaded via dynamic `await import()`
 * from the snippet itself, the deny-list would race the snippet's own
 * imports and miss some of them. `--preload` runs the lockdown to
 * completion before the snippet's module graph starts.
 *
 * The snippet is written to a temp file (not passed via `--eval`)
 * because `--eval` snippets and `--preload` scripts share the same
 * module loader, and `--eval` content is parsed BEFORE preload bodies
 * finish — making the deny-list races unreliable.
 *
 * `lockdownImport: false` skips the lockdown — used as a baseline
 * sanity-check that the attack actually does something without it.
 */
async function runAttack(
  snippet: string,
  opts: { mode?: 'enforce' | 'warn' | 'off'; lockdownImport?: boolean } = {}
): Promise<AttackResult> {
  const { mode = 'enforce', lockdownImport = true } = opts;
  const wrapped = `
    try {
      ${snippet}
    } catch (e) {
      console.log('CAUGHT:' + (e instanceof Error ? e.message : String(e)));
    }
  `;
  const tmpDir = mkdtempSync(join(tmpdir(), 'brika-redteam-'));
  const scriptPath = join(tmpDir, 'attack.ts');
  writeFileSync(scriptPath, wrapped, 'utf8');
  const args = lockdownImport
    ? ['bun', `--preload=${LOCKDOWN_PATH}`, scriptPath]
    : ['bun', scriptPath];
  const proc = Bun.spawn(args, {
    env: { ...process.env, BRIKA_LOCKDOWN_MODE: mode },
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

describe('lockdown enforce mode — ambient I/O globals', () => {
  test('globalThis.fetch is scrubbed and throws PermissionDeniedError', async () => {
    const out = await runAttack(`
      const r = await fetch('https://api.example.com/');
      console.log('LEAKED:' + r.status);
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*globalThis\.fetch is not available/);
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('globalThis.WebSocket is scrubbed', async () => {
    const out = await runAttack(`
      const ws = new WebSocket('wss://attacker.example/');
      console.log('LEAKED:' + typeof ws);
    `);
    expect(out.stdout).toContain('CAUGHT:');
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('Bun.spawn is scrubbed', async () => {
    const out = await runAttack(`
      const p = Bun.spawn(['echo', 'leak']);
      console.log('LEAKED:' + p.pid);
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*Bun\.spawn is not available/);
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('Bun.write is scrubbed', async () => {
    const out = await runAttack(`
      await Bun.write('/tmp/brika-redteam-should-not-exist', 'leak');
      console.log('LEAKED:wrote');
    `);
    expect(out.stdout).toContain('CAUGHT:');
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('Bun.file is scrubbed', async () => {
    const out = await runAttack(`
      const f = Bun.file('/etc/hosts');
      console.log('LEAKED:' + (await f.text()).length);
    `);
    expect(out.stdout).toContain('CAUGHT:');
    expect(out.stdout).not.toContain('LEAKED:');
  });

  // `Bun.dns` itself is non-writable/non-configurable so we can't replace
  // the namespace; instead each I/O method on it is replaced individually.
  // Pinning `lookup` here as the canonical case — if this regresses, the
  // whole DNS surface (resolve*, reverse, prefetch, setServers, …) is
  // probably also broken.
  test('Bun.dns.lookup is scrubbed', async () => {
    const out = await runAttack(`
      const r = await Bun.dns.lookup('example.com');
      console.log('LEAKED:' + JSON.stringify(r));
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*Bun\.dns\.lookup is not available/);
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('Bun.dns.setServers is scrubbed', async () => {
    const out = await runAttack(`
      Bun.dns.setServers(['8.8.8.8']);
      console.log('LEAKED:setServers ran');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*Bun\.dns\.setServers is not available/);
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('eval is scrubbed', async () => {
    const out = await runAttack(`
      const r = eval('1+1');
      console.log('LEAKED:' + r);
    `);
    expect(out.stdout).toContain('CAUGHT:');
    expect(out.stdout).not.toContain('LEAKED:');
  });

  // `process.kill` would let a plugin signal any pid it can guess — most
  // dangerously the hub process itself (`process.kill(parentPid, 'SIGTERM')`).
  // `process.dlopen` loads arbitrary native libraries, bypassing the
  // `bun:ffi` module deny-list. Both are out-of-band capabilities that
  // are NOT reachable through the grant vector.
  test('process.kill is scrubbed', async () => {
    const out = await runAttack(`
      process.kill(process.pid, 0);
      console.log('LEAKED:kill ran');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*process\.kill is not available/);
    expect(out.stdout).not.toContain('LEAKED:');
  });

  test('process.dlopen is scrubbed', async () => {
    const out = await runAttack(`
      process.dlopen({ exports: {} }, '/nonexistent.so', 0);
      console.log('LEAKED:dlopen ran');
    `);
    expect(out.stdout).toMatch(/CAUGHT:.*process\.dlopen is not available/);
    expect(out.stdout).not.toContain('LEAKED:');
  });

  // ─── swapInProxy: prelude can replace scrubbed slots after vector install ───
  // The fetch proxy lives in prelude/proxies/fetch-proxy.ts and installs
  // AFTER lockdown via swapInProxy(). This test verifies the swap
  // mechanism: it replaces the deny-stub atomically AND updates the
  // snapshot so assertSealed() still passes. Without the snapshot
  // update, the integrity gate would crash the plugin.
  test('swapInProxy replaces a scrubbed slot AND keeps assertSealed() happy', async () => {
    const out = await runAttack(`
      const { swapInProxy, assertSealed } = await import('${LOCKDOWN_PATH}');
      // Pre-swap: fetch is the deny stub, which throws SYNCHRONOUSLY.
      // Wrap to capture the message without escaping the outer try.
      let before = 'allowed-unexpectedly';
      try { fetch('https://x/'); } catch (e) { before = e.message; }
      // Swap in a real implementation.
      const replacement = () => Promise.resolve(new Response('swapped'));
      const ok = swapInProxy('globalThis', 'fetch', replacement);
      const drift = assertSealed();
      const after = await fetch('https://x/').then((r) => r.text());
      console.log(JSON.stringify({ ok, before, drift, after }));
    `);
    const line = out.stdout.split('\n').find((l) => l.startsWith('{')) ?? '{}';
    if (line === '{}') {
      // Surface what the snippet did print so the failure has signal.
      throw new Error(`no JSON line found in output:\nstdout=${out.stdout}\nstderr=${out.stderr}`);
    }
    const parsed = JSON.parse(line) as {
      ok: boolean;
      before: string;
      drift: ReadonlyArray<string> | null;
      after: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.before).toMatch(/globalThis\.fetch is not available/);
    expect(parsed.drift).toBeNull();
    expect(parsed.after).toBe('swapped');
  });

  // Belt-and-suspenders: swapInProxy on an owner/key that wasn't part of
  // the scrub list refuses to record a snapshot entry, so a future
  // tampering attempt that happens to match the swap target would still
  // be caught.
  test('swapInProxy refuses to record an entry for an unscrubbed key', async () => {
    const out = await runAttack(`
      const { swapInProxy } = await import('${LOCKDOWN_PATH}');
      const ok = swapInProxy('globalThis', 'nonexistent_slot', () => 1);
      console.log('ok:' + ok);
    `);
    expect(out.stdout).toContain('ok:false');
  });

  // `Request` and `Response` are deliberately NOT scrubbed — they're pure
  // value constructors with no I/O of their own. Pinning the behaviour
  // here so a future "tighten the lockdown" PR doesn't silently re-add
  // them and break libraries (e.g. @matter/nodejs's NodeJsHttpRequest)
  // that subclass them. The actual network gate is `fetch`, covered above.
  test('Request is constructible and subclassable (value-only, no scrub)', async () => {
    const out = await runAttack(`
      const r = new Request('https://example.invalid/');
      class MyRequest extends Request {}
      const m = new MyRequest('https://example.invalid/');
      console.log('OK:' + r.url + ':' + (m instanceof Request));
    `);
    expect(out.stdout).toContain('OK:https://example.invalid/:true');
    expect(out.stdout).not.toContain('CAUGHT:');
  });

  test('Response is constructible and subclassable (value-only, no scrub)', async () => {
    const out = await runAttack(`
      const r = new Response('hello', { status: 200 });
      class MyResponse extends Response {}
      const m = new MyResponse('body');
      console.log('OK:' + r.status + ':' + (m instanceof Response));
    `);
    expect(out.stdout).toContain('OK:200:true');
    expect(out.stdout).not.toContain('CAUGHT:');
  });
});

describe('lockdown enforce mode — documented Bun built-in-import limitation', () => {
  // Bun 1.3.13's plugin system does NOT intercept built-in module
  // imports (node:*, bun:*) issued as bare specifiers — they resolve
  // through Bun's C++ module table, bypassing JS-level plugins. The
  // deny-list registration still happens (and would catch user-space
  // relative-path indirection that hits onResolve), but built-ins
  // pass through. See the comment in lockdown.ts §4.
  //
  // These tests pin the current behaviour so we notice (loudly) when
  // Bun closes the gap. Each failing test here is a SIGNAL: flip the
  // assertion + remove the LIMIT_DOCUMENTED comment in lockdown.ts.

  test('LIMIT_DOCUMENTED: node:fs bypasses the deny-list', async () => {
    const out = await runAttack(`
      const fs = await import('node:fs');
      console.log('LEAKED:' + typeof fs.readFileSync);
    `);
    expect(out.stdout).toContain('LEAKED:function');
  });

  test('LIMIT_DOCUMENTED: bun:ffi bypasses the deny-list', async () => {
    const out = await runAttack(`
      const ffi = await import('bun:ffi');
      console.log('LEAKED:' + typeof ffi.dlopen);
    `);
    expect(out.stdout).toContain('LEAKED:function');
  });

  test('non-denied node:path still resolves (positive control)', async () => {
    const out = await runAttack(`
      const path = await import('node:path');
      console.log('OK:' + typeof path.join);
    `);
    expect(out.stdout).toContain('OK:function');
  });
});

describe('lockdown warn mode (migration window)', () => {
  test('warn mode logs but delegates to real fetch', async () => {
    // Real fetch would normally hit the network — point at a guaranteed-
    // unreachable host. The point isn't whether the fetch succeeds; the
    // point is that the lockdown didn't THROW. We expect a "warn access"
    // log line on stderr and either a network error or a response.
    const out = await runAttack(
      `
        try {
          await fetch('https://invalid.localhost.invalid.example/');
        } catch {
          /* network failure is expected — what matters is no PermissionDeniedError */
        }
        console.log('DELEGATED');
      `,
      { mode: 'warn' }
    );
    expect(out.stdout).toContain('DELEGATED');
    expect(out.stdout).not.toContain('CAUGHT:');
    expect(out.stderr).toMatch(/\[brika:lockdown\].*globalThis\.fetch/);
  });
});

describe('lockdown baseline — without the lockdown each attack would succeed', () => {
  // These tests prove the lockdown is what's actually doing the blocking.
  // If any of these regressed (i.e. attack failed even without lockdown),
  // the enforce-mode tests above would be passing for the wrong reason.

  test('without lockdown, globalThis.fetch is callable', async () => {
    const out = await runAttack(
      `
        try {
          await fetch('https://invalid.localhost.invalid.example/');
        } catch (e) {
          // Network failure is expected; we only care it WASN'T a PermissionDenied.
          if (e instanceof Error && e.message.includes('not available to plugins')) {
            console.log('BLOCKED');
          } else {
            console.log('REACHABLE');
          }
        }
      `,
      { lockdownImport: false }
    );
    expect(out.stdout).toContain('REACHABLE');
    expect(out.stdout).not.toContain('BLOCKED');
  });

  test('without lockdown, node:fs imports fine', async () => {
    const out = await runAttack(
      `
        const fs = await import('node:fs');
        console.log('REACHABLE:' + typeof fs.readFileSync);
      `,
      { lockdownImport: false }
    );
    expect(out.stdout).toContain('REACHABLE:function');
  });
});

afterEach(() => {
  // No-op — each test owns its subprocess and cleans itself up via
  // proc.exited above. afterEach is here to keep the structure
  // consistent for future expansion.
});
