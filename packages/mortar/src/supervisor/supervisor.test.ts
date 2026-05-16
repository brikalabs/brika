import { describe, expect, test } from 'bun:test';
import type { ServiceSpec } from '../config';
import { type ServiceState, Supervisor, type SupervisorEvent, splitCommand } from '.';

/** Wait until a predicate over the supervisor's state turns true. */
function waitFor(
  supervisor: Supervisor,
  predicate: (states: ReadonlyArray<ServiceState>) => boolean,
  { timeoutMs = 5_000, label = 'condition' }: { timeoutMs?: number; label?: string } = {}
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const check = (): boolean => {
      if (predicate(supervisor.list())) {
        cleanup();
        resolve();
        return true;
      }
      return false;
    };
    const off = supervisor.subscribe(() => check());
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitFor "${label}" timed out (${timeoutMs}ms)`));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      off();
    };
    // Catches the case where the predicate is already true at subscription
    // time (e.g. for a quick assertion right after start()).
    check();
  });
}

/** Long-running service that sleeps for `ms` (default 60s). */
function longRunning(id: string, ms = 60_000, extra: Partial<ServiceSpec> = {}): ServiceSpec {
  return {
    id,
    label: id,
    command: `bun -e "await Bun.sleep(${ms})"`,
    env: {},
    dependsOn: [],
    port: null,
    health: { kind: 'none' },
    url: null,
    cwd: null,
    ...extra,
  };
}

function noisy(id: string, line: string, ms = 60_000): ServiceSpec {
  return {
    id,
    label: id,
    command: `bun -e "console.log('${line}'); await Bun.sleep(${ms})"`,
    env: {},
    dependsOn: [],
    port: null,
    health: { kind: 'none' },
    url: null,
    cwd: null,
  };
}

// Tests run concurrently within each describe to keep wall-clock low — every
// test owns its own Supervisor, and `await using` guarantees per-test cleanup
// regardless of pass/fail. The longer per-test timeout absorbs CPU contention
// when ~20 children are spawning at once.
const CONCURRENT_TEST_TIMEOUT_MS = 15_000;

// ─── splitCommand ───────────────────────────────────────────────────────────

describe.concurrent('splitCommand', () => {
  test('splits on whitespace', () => {
    expect(splitCommand('bun --filter @brika/hub dev')).toEqual([
      'bun',
      '--filter',
      '@brika/hub',
      'dev',
    ]);
  });

  test('preserves double-quoted segments as one token', () => {
    expect(splitCommand(`bun -e "console.log('hi')"`)).toEqual(['bun', '-e', "console.log('hi')"]);
  });

  test('preserves single-quoted segments as one token', () => {
    expect(splitCommand(`bun -e 'console.log("hi")'`)).toEqual(['bun', '-e', 'console.log("hi")']);
  });

  test('concatenates quoted and unquoted runs', () => {
    expect(splitCommand(`foo"bar baz"qux`)).toEqual(['foobar bazqux']);
  });

  test('collapses runs of whitespace', () => {
    expect(splitCommand('  a   b\tc\nd  ')).toEqual(['a', 'b', 'c', 'd']);
  });

  test('throws on empty command', () => {
    expect(() => splitCommand('   ')).toThrow(/empty/);
  });

  test('throws on unclosed quote', () => {
    expect(() => splitCommand('echo "oops')).toThrow(/unclosed/);
  });
});

// ─── list / get / subscribe ─────────────────────────────────────────────────

describe.concurrent('Supervisor (introspection)', () => {
  test('starts in pending state for every service', async () => {
    await using sup = new Supervisor([longRunning('a'), longRunning('b')]);
    expect(sup.list().map((s) => s.spec.id)).toEqual(['a', 'b']);
    expect(sup.list().every((s) => s.status.kind === 'pending')).toBe(true);
  });

  test('get() returns null for unknown ids', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    expect(sup.get('a')?.spec.id).toBe('a');
    expect(sup.get('ghost')).toBeNull();
  });

  test('subscribe() returns an unsubscribe function', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    const events: SupervisorEvent[] = [];
    const off = sup.subscribe((e) => events.push(e));
    off();
    sup.start();
    expect(events).toEqual([]);
  });
});

// ─── lifecycle ──────────────────────────────────────────────────────────────

describe.concurrent('Supervisor (lifecycle)', () => {
  test(
    'a service with health:none becomes healthy after spawn',
    async () => {
      await using sup = new Supervisor([longRunning('a')]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', { label: 'a healthy' });
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'captures stdout into the log ring buffer',
    async () => {
      await using sup = new Supervisor([noisy('a', 'hello-from-a')]);
      sup.start();
      await waitFor(
        sup,
        (states) => states[0]?.logs.some((l) => l.includes('hello-from-a')) ?? false,
        { label: 'log line' }
      );
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'treats `\\r` as in-place redraw (no stacked dupes)',
    async () => {
      // Vite-style banner that redraws via `\r` then ends with `\n`. The
      // expected captured line is only the FINAL frame.
      await using sup = new Supervisor([
        {
          id: 'redraw',
          label: 'redraw',
          command: `bun -e "process.stdout.write('frame-A'); await Bun.sleep(20); process.stdout.write('\\rframe-B'); await Bun.sleep(20); process.stdout.write('\\rfinal\\n'); await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.logs.some((l) => l === 'final') ?? false, {
        label: 'final frame visible',
      });
      const logs = sup.get('redraw')?.logs ?? [];
      expect(logs).not.toContain('frame-A');
      expect(logs).not.toContain('frame-B');
      expect(logs).toContain('final');
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'strips non-SGR ANSI control sequences (cursor moves, clear-line)',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'ctrl',
          label: 'ctrl',
          command: `bun -e "console.log('\\x1b[2A\\x1b[Khello'); await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.logs.some((l) => l === 'hello') ?? false, {
        label: 'stripped line',
      });
      const logs = sup.get('ctrl')?.logs ?? [];
      expect(logs.find((l) => l.includes('hello'))).toBe('hello');
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'preserves SGR color codes (chalk-style output stays colored)',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'color',
          label: 'color',
          command: `bun -e "console.log('\\x1b[31mred\\x1b[0m'); await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => (states[0]?.logs.length ?? 0) > 0, { label: 'any line' });
      const logs = sup.get('color')?.logs ?? [];
      const colored = logs.find((l) => l.includes('red'));
      expect(colored).toContain('\x1b[31m');
      expect(colored).toContain('\x1b[0m');
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'dedups consecutive identical lines (collapse redraws)',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'dup',
          label: 'dup',
          command: `bun -e "for (let i = 0; i < 5; i++) console.log('same'); await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.logs.some((l) => l === 'same') ?? false, {
        label: 'first emit',
      });
      await Bun.sleep(100);
      const sameLines = sup.get('dup')?.logs.filter((l) => l === 'same') ?? [];
      // 5 prints → 1 line after consecutive dedup.
      expect(sameLines).toHaveLength(1);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'strips the bun --filter prefix from captured lines',
    async () => {
      // Print a line that LOOKS like bun --filter wrapped it ourselves,
      // so the stripper can run on the captured output without needing
      // a real workspace package to spawn.
      await using sup = new Supervisor([
        {
          id: 'pre',
          label: 'pre',
          command: `bun -e "console.log('@brika/signaling dev: [signaling] listening on :8787'); await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(
        sup,
        (states) => states[0]?.logs.some((l) => l.startsWith('[signaling] listening')) ?? false,
        { label: 'stripped line' }
      );
      const cleaned = sup.get('pre')?.logs.find((l) => l.includes('[signaling]'));
      expect(cleaned).toBe('[signaling] listening on :8787');
      expect(cleaned).not.toContain('@brika/signaling dev:');
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'logs stream live (sees line N before line N+1)',
    async () => {
      // Service prints "tick 0", "tick 1", "tick 2" with 400ms between
      // each. We assert we observe "tick 0" before "tick 2" lands —
      // proving the supervisor doesn't buffer the whole stream. The
      // generous 400ms cadence absorbs CPU contention under concurrent
      // coverage runs without losing the "not buffered" signal.
      await using sup = new Supervisor([
        {
          id: 'ticker',
          label: 'ticker',
          command: `bun -e "for (let i = 0; i < 5; i++) { console.log('tick ' + i); await Bun.sleep(400); } await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      // First milestone: tick 0 appears.
      await waitFor(sup, (states) => states[0]?.logs.some((l) => l.includes('tick 0')) ?? false, {
        label: 'tick 0',
      });
      const sawTick0At = Date.now();
      // Second milestone: tick 2 appears.
      await waitFor(sup, (states) => states[0]?.logs.some((l) => l.includes('tick 2')) ?? false, {
        label: 'tick 2',
      });
      // tick 2 is at least 2 * 400ms = 800ms after tick 0 by construction.
      // If logs were buffered, we'd see them all at once and the elapsed
      // time would be ~0. The 200ms floor is conservative; we just need
      // to distinguish "streamed" from "batched-after-exit".
      expect(Date.now() - sawTick0At).toBeGreaterThanOrEqual(200);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'order of state transitions respects dependsOn',
    async () => {
      const events: Array<{ id: string; kind: string }> = [];
      await using sup = new Supervisor([
        longRunning('coord'),
        longRunning('hub', 60_000, { dependsOn: ['coord'] }),
      ]);
      sup.subscribe((e) => {
        if (e.kind !== 'state') {
          return;
        }
        const svc = sup.get(e.serviceId);
        if (svc) {
          events.push({ id: svc.spec.id, kind: svc.status.kind });
        }
      });
      sup.start();
      await waitFor(sup, (states) => states.every((s) => s.status.kind === 'healthy'), {
        label: 'both healthy',
      });
      // The first 'starting' event for hub must come AFTER the first
      // 'healthy' event for coord. (Hub may also fire 'pending' bumps
      // earlier from the constructor; we only care about the start.)
      const hubStartIdx = events.findIndex((e) => e.id === 'hub' && e.kind === 'starting');
      const coordHealthyIdx = events.findIndex((e) => e.id === 'coord' && e.kind === 'healthy');
      expect(hubStartIdx).toBeGreaterThan(-1);
      expect(coordHealthyIdx).toBeGreaterThan(-1);
      expect(hubStartIdx).toBeGreaterThan(coordHealthyIdx);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'marks a service as crashed when it exits with non-zero',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'fail',
          label: 'fail',
          command: 'bun -e "process.exit(2)"',
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'crashed', {
        label: 'crashed',
      });
      const status = sup.get('fail')?.status;
      if (status?.kind !== 'crashed') {
        throw new Error(`expected crashed, got ${status?.kind}`);
      }
      expect(status.exitCode).toBe(2);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'marks a clean early exit as crashed (long-running services should not exit 0)',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'a',
          label: 'a',
          command: 'bun -e "process.exit(0)"',
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'crashed', {
        label: 'crashed',
      });
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'downstream services stay pending when a dep crashes before health',
    async () => {
      // Dep's healthcheck never succeeds (no listener on :1) and the
      // process exits early — the supervisor must mark it crashed and
      // never schedule the downstream.
      await using sup = new Supervisor([
        {
          id: 'dep',
          label: 'dep',
          command: 'bun -e "process.exit(1)"',
          env: {},
          dependsOn: [],
          health: { kind: 'http', url: 'http://127.0.0.1:1/', timeoutMs: 5_000 },
          url: null,
          cwd: null,
          port: null,
        },
        longRunning('downstream', 60_000, { dependsOn: ['dep'] }),
      ]);
      sup.start();
      await waitFor(sup, (states) => sup.get('dep')?.status.kind === 'crashed', {
        label: 'dep crashed',
      });
      await Bun.sleep(50);
      expect(sup.get('downstream')?.status.kind).toBe('pending');
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );
});

// ─── restart ────────────────────────────────────────────────────────────────

describe.concurrent('Supervisor (restart)', () => {
  test(
    'restart() rerolls a service back to healthy',
    async () => {
      await using sup = new Supervisor([longRunning('a')]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', {
        label: 'first healthy',
      });
      await sup.restart('a');
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', {
        label: 'healthy after restart',
      });
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test('restart() on an unknown id is a no-op', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    await sup.restart('ghost'); // does not throw
  });

  test(
    'restartAll() reboots every service back to healthy',
    async () => {
      await using sup = new Supervisor([longRunning('a'), longRunning('b')]);
      sup.start();
      await waitFor(sup, (states) => states.every((s) => s.status.kind === 'healthy'), {
        label: 'all healthy first',
      });
      await sup.restartAll();
      await waitFor(sup, (states) => states.every((s) => s.status.kind === 'healthy'), {
        label: 'all healthy after restartAll',
      });
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );
});

// ─── shutdown ───────────────────────────────────────────────────────────────

describe.concurrent('Supervisor (shutdown)', () => {
  test(
    'shutdown() terminates every live child',
    async () => {
      await using sup = new Supervisor([longRunning('a'), longRunning('b')]);
      sup.start();
      await waitFor(sup, (states) => states.every((s) => s.status.kind === 'healthy'), {
        label: 'all healthy',
      });
      await sup.shutdown();
      // A second shutdown returns immediately.
      const t0 = Date.now();
      await sup.shutdown();
      expect(Date.now() - t0).toBeLessThan(500);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'shutdown() emits a single shutdown event',
    async () => {
      await using sup = new Supervisor([longRunning('a')]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', { label: 'healthy' });
      const events: SupervisorEvent[] = [];
      sup.subscribe((e) => events.push(e));
      await sup.shutdown();
      expect(events.some((e) => e.kind === 'shutdown')).toBe(true);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );
});

// ─── bad commands ───────────────────────────────────────────────────────────

describe.concurrent('Supervisor (bad commands)', () => {
  test(
    'an empty command marks the service as crashed (no throw out of start)',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'bad',
          label: 'bad',
          command: '   ',
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'crashed', { label: 'crashed' });
      const status = sup.get('bad')?.status;
      if (status?.kind !== 'crashed') {
        throw new Error('not crashed');
      }
      expect(status.reason).toMatch(/empty/);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'an unclosed quote marks the service as crashed',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'bad',
          label: 'bad',
          command: 'echo "oops',
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'crashed', { label: 'crashed' });
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test('health: auto detects the listening port via lsof', async () => {
    // Spawn a real Bun.serve child on a fixed port, gate startup on
    // health: auto, and assert: the supervisor marks it healthy AND
    // records the detected port in ServiceState.
    const port = 7700 + Math.floor(Math.random() * 200);
    await using sup = new Supervisor([
      {
        id: 'auto',
        label: 'auto',
        command: `bun -e "Bun.serve({ port: ${port}, fetch: () => new Response('ok') }); await Bun.sleep(60000)"`,
        env: {},
        dependsOn: [],
        health: { kind: 'auto', timeoutMs: 15_000 },
        url: null,
        cwd: null,
        port: null,
      },
    ]);
    sup.start();
    await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', {
      label: 'auto healthy',
      timeoutMs: 20_000,
    });
    expect(sup.get('auto')?.detectedPort).toBe(port);
  }, 25_000);

  test(
    'writeStdin delivers bytes to the focused service',
    async () => {
      // Child reads one line from stdin and echoes it. We assert the
      // echoed line appears in the captured logs.
      await using sup = new Supervisor([
        {
          id: 'echo',
          label: 'echo',
          command: `bun -e "const r = Bun.stdin.stream().getReader(); const { value } = await r.read(); process.stdout.write('echo:' + new TextDecoder().decode(value)); await Bun.sleep(60000)"`,
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      // Wait for the spawn to settle so stdin is plumbed.
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', { label: 'healthy' });
      expect(sup.writeStdin('echo', 'hello\n')).toBe(true);
      await waitFor(
        sup,
        (states) => states[0]?.logs.some((l) => l.includes('echo:hello')) ?? false,
        {
          label: 'echo line',
          timeoutMs: 10_000,
        }
      );
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test('writeStdin returns false for unknown / dead services', async () => {
    await using sup = new Supervisor([
      {
        id: 'a',
        label: 'a',
        command: 'bun -e "await Bun.sleep(60000)"',
        env: {},
        dependsOn: [],
        health: { kind: 'none' },
        url: null,
        cwd: null,
        port: null,
      },
    ]);
    expect(sup.writeStdin('ghost', 'x')).toBe(false);
    // 'a' hasn't been started yet → no proc.
    expect(sup.writeStdin('a', 'x')).toBe(false);
  });

  test(
    'inherits env on top of spec env',
    async () => {
      await using sup = new Supervisor([
        {
          id: 'echo',
          label: 'echo',
          command: `bun -e "console.log(process.env.MORTAR_TEST_VAR ?? 'unset'); await Bun.sleep(60000)"`,
          env: { MORTAR_TEST_VAR: 'from-spec' },
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      await waitFor(
        sup,
        (states) => states[0]?.logs.some((l) => l.includes('from-spec')) ?? false,
        {
          label: 'env propagated',
          timeoutMs: 10_000,
        }
      );
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );
});

// ─── isAlive / hasSpawned / liveCount ───────────────────────────────────────

describe.concurrent('isAlive / hasSpawned', () => {
  test('hasSpawned is false for services that never started', async () => {
    await using sup = new Supervisor([
      // A service whose dep is `unknown-dep` would never satisfy `dependsOn`,
      // so it can never spawn. But validate() would catch that; here we
      // just construct directly to test the predicate without `start()`.
      longRunning('a'),
    ]);
    // No start() — proc is still null.
    expect(sup.hasSpawned('a')).toBe(false);
    expect(sup.isAlive('a')).toBe(false);
    expect(sup.liveCount()).toBe(0);
  });

  test(
    'hasSpawned + isAlive flip true after start',
    async () => {
      await using sup = new Supervisor([longRunning('a')]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', {
        label: 'service starts',
      });
      expect(sup.hasSpawned('a')).toBe(true);
      expect(sup.isAlive('a')).toBe(true);
      expect(sup.liveCount()).toBe(1);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test(
    'isAlive flips false after shutdown',
    async () => {
      await using sup = new Supervisor([longRunning('a')]);
      sup.start();
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', {
        label: 'service starts',
      });
      await sup.shutdown();
      expect(sup.isAlive('a')).toBe(false);
      expect(sup.liveCount()).toBe(0);
      // Still counts as having been spawned.
      expect(sup.hasSpawned('a')).toBe(true);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test('unknown service id → all predicates return false', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    expect(sup.hasSpawned('ghost')).toBe(false);
    expect(sup.isAlive('ghost')).toBe(false);
  });
});

// ─── writeStdin ─────────────────────────────────────────────────────────────

describe.concurrent('writeStdin', () => {
  test('returns false for unknown service id', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    expect(sup.writeStdin('ghost', 'x')).toBe(false);
  });

  test('returns false before the service has spawned', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    // Don't start — proc is null.
    expect(sup.writeStdin('a', 'x')).toBe(false);
  });

  test(
    'returns true for a running service with a piped stdin',
    async () => {
      // Echo whatever it gets on stdin so we can confirm the write went through.
      await using sup = new Supervisor([
        {
          id: 'echo',
          label: 'echo',
          command: 'cat',
          env: {},
          dependsOn: [],
          health: { kind: 'none' },
          url: null,
          cwd: null,
          port: null,
        },
      ]);
      sup.start();
      // Wait for the proc object to exist (status flips to 'healthy' for
      // health: none right after spawn).
      await waitFor(sup, (states) => states[0]?.status.kind === 'healthy', {
        label: 'cat spawned',
      });
      expect(sup.writeStdin('echo', 'hello\n')).toBe(true);
      await waitFor(sup, (states) => states[0]?.logs.some((l) => l === 'hello') ?? false, {
        label: 'stdin echoed back',
        timeoutMs: 10_000,
      });
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );
});

// ─── root / isShuttingDown ──────────────────────────────────────────────────

describe.concurrent('Supervisor metadata', () => {
  test('root reflects the constructor argument', async () => {
    await using sup = new Supervisor([longRunning('a')], '/some/where');
    expect(sup.root).toBe('/some/where');
  });

  test(
    'isShuttingDown flips after shutdown is called',
    async () => {
      await using sup = new Supervisor([longRunning('a')]);
      sup.start();
      expect(sup.isShuttingDown).toBe(false);
      await sup.shutdown();
      expect(sup.isShuttingDown).toBe(true);
    },
    CONCURRENT_TEST_TIMEOUT_MS
  );

  test('get(serviceId) returns the state, null for unknown', async () => {
    await using sup = new Supervisor([longRunning('a')]);
    expect(sup.get('a')).not.toBeNull();
    expect(sup.get('ghost')).toBeNull();
  });
});
