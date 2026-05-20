/**
 * Capability flow — end-to-end integration test.
 *
 * Spawns a real Bun subprocess with the hub prelude loaded, mocks the
 * `capability.vector.get` and `capability.request` RPCs from the test side,
 * and verifies the full plumbing:
 *
 *   1. Prelude awaits the vector RPC at startup and installs it.
 *   2. Plugin code's `buildCtx(vector, channel)` produces a working Proxy.
 *   3. `ctx.location.timezone()` from inside the plugin issues the right
 *      `capability.request` wire payload and receives the deserialized
 *      result.
 *   4. Calls to a NOT-granted capability id reject at the SDK boundary
 *      without ever hitting the wire.
 *
 * Scenarios are driven via fire-and-forget messages, not channel RPCs, to
 * avoid the drain-queue deadlock (a `channel.implement` handler that
 * `await`s another `channel.call` blocks the drain that's needed to
 * deliver the response — see `fixtures/capability-test-plugin.ts`).
 */

import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

setDefaultTimeout(30_000);

import { join } from 'node:path';

const BUN = process.execPath;
const PRELUDE = join(import.meta.dir, '../runtime/plugins/prelude/index.ts');
const FIXTURE = join(import.meta.dir, 'fixtures/capability-test-plugin.ts');

interface WireMessage {
  t: string;
  _id?: number;
  [key: string]: unknown;
}

interface ScenarioResult {
  runId: number;
  ok: boolean;
  [key: string]: unknown;
}

interface SpawnResult {
  proc: Bun.Subprocess;
  ready: Promise<void>;
  runScenario(scenario: string): Promise<ScenarioResult>;
  stop(): Promise<void>;
}

/**
 * Spawn the prelude with the capability fixture, mocking the two RPCs
 * the prelude depends on at startup:
 *   - `capability.vector.get` returns the supplied vector
 *   - `capability.request`     returns the supplied per-id responder map
 */
function spawnWithCapabilities(opts: {
  vector: { grants: Array<{ id: string; ctxPath: string; scope?: unknown }> };
  capabilityResponders?: Record<string, (args: unknown) => unknown>;
}): SpawnResult {
  let resolveReady: ((value: void) => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const scenarioWaiters = new Map<number, (r: ScenarioResult) => void>();
  let nextRunId = 1;

  function handleFireAndForget(wire: WireMessage): void {
    if (wire.t === 'ctxReady') {
      resolveReady?.();
      return;
    }
    if (wire.t === 'scenarioResult') {
      const r = wire as unknown as ScenarioResult;
      const waiter = scenarioWaiters.get(r.runId);
      if (waiter) {
        scenarioWaiters.delete(r.runId);
        waiter(r);
      }
    }
  }

  function handleCapabilityRequest(id: number, reqId: string, args: unknown): void {
    const responder = opts.capabilityResponders?.[reqId];
    if (!responder) {
      proc.send({
        t: 'capability.requestResult',
        _id: id,
        result: {
          _rpcError: true,
          code: 'NOT_REGISTERED',
          message: `Test harness has no responder for "${reqId}"`,
        },
      });
      return;
    }
    try {
      const result = responder(args);
      proc.send({ t: 'capability.requestResult', _id: id, result: { result } });
    } catch (e) {
      proc.send({
        t: 'capability.requestResult',
        _id: id,
        result: {
          _rpcError: true,
          code: 'HANDLER_THREW',
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  const proc = Bun.spawn([BUN, `--preload=${PRELUDE}`, FIXTURE], {
    stdio: ['pipe', 'pipe', 'inherit'],
    serialization: 'advanced',
    ipc: (raw) => {
      const wire = raw as WireMessage;
      if (wire._id === undefined) {
        handleFireAndForget(wire);
        return;
      }
      if (typeof wire.t === 'string' && wire.t.endsWith('Result')) {
        return; // No test-initiated calls; nothing to dispatch.
      }
      if (wire.t === 'capability.vector.get') {
        proc.send({
          t: 'capability.vector.getResult',
          _id: wire._id,
          result: { grants: opts.vector.grants },
        });
        return;
      }
      if (wire.t === 'capability.request') {
        handleCapabilityRequest(wire._id, wire.id as string, wire.args);
        return;
      }
      if (wire.t === 'ping') {
        proc.send({ t: 'pingResult', _id: wire._id, result: { ts: wire.ts } });
      }
    },
  });

  return {
    proc,
    ready,
    runScenario(scenario) {
      const runId = nextRunId++;
      return new Promise<ScenarioResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          scenarioWaiters.delete(runId);
          reject(new Error(`scenario "${scenario}" timed out (runId=${runId})`));
        }, 15_000);
        scenarioWaiters.set(runId, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
        proc.send({ t: 'runScenario', scenario, runId });
      });
    },
    async stop() {
      proc.send({ t: 'stop' });
      await proc.exited;
    },
  };
}

describe('Capability flow — end to end', () => {
  let helper: SpawnResult | null = null;

  afterEach(async () => {
    if (helper) {
      try {
        helper.proc.kill();
        await helper.proc.exited;
      } catch {
        // already dead
      }
      helper = null;
    }
  });

  test('prelude installs the vector and ctx.location.timezone reaches the hub', async () => {
    let seenArgs: unknown;
    helper = spawnWithCapabilities({
      vector: {
        grants: [{ id: 'dev.brika.location.timezone', ctxPath: 'location.timezone' }],
      },
      capabilityResponders: {
        'dev.brika.location.timezone': (args) => {
          seenArgs = args;
          return { timezone: 'Europe/Zurich' };
        },
      },
    });

    await helper.ready;
    const res = await helper.runScenario('locationTimezone');
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ timezone: 'Europe/Zurich' });
    expect(seenArgs).toEqual({});
    await helper.stop();
  });

  test('a not-granted capability rejects at the SDK boundary without IPC', async () => {
    let capabilityRequestSeen = false;
    helper = spawnWithCapabilities({
      vector: { grants: [] },
      capabilityResponders: {
        'anything.at.all': () => {
          capabilityRequestSeen = true;
          return {};
        },
      },
    });

    await helper.ready;
    const res = await helper.runScenario('missingCapability');
    expect(res.ok).toBe(true);
    expect(res.deniedAtBoundary).toBe(true);
    expect(res.message as string).toContain('grant vector');
    expect(capabilityRequestSeen).toBe(false);
    await helper.stop();
  });

  test('handler errors surface to the plugin as rejected promises', async () => {
    helper = spawnWithCapabilities({
      vector: {
        grants: [{ id: 'dev.brika.location.timezone', ctxPath: 'location.timezone' }],
      },
      capabilityResponders: {
        'dev.brika.location.timezone': () => {
          throw new Error('upstream is down');
        },
      },
    });

    await helper.ready;
    const res = await helper.runScenario('locationTimezone');
    expect(res.ok).toBe(false);
    expect(res.error as string).toContain('upstream is down');
    await helper.stop();
  });
});
