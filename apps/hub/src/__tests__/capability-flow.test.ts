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
  /**
   * Issue an RPC the plugin has implemented via `channel.implement`. Used by
   * the nested-RPC drain-queue regression test — that test deliberately
   * goes through the channel's request path so the handler runs INSIDE the
   * drain. The fire-and-forget runScenario path bypasses the drain.
   */
  call(type: string, payload?: Record<string, unknown>): Promise<WireMessage>;
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

  // Channel-style response waiters for harness-initiated RPCs.
  const callWaiters = new Map<number, (msg: WireMessage) => void>();
  let nextCallId = 1;

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
      // Mirror what the production hub's errorToWire emits: include the
      // original throw as `cause` and the local stack so the plugin sees
      // a fully-typed remote error (Phase 4 behavior).
      const err = e instanceof Error ? e : new Error(String(e));
      proc.send({
        t: 'capability.requestResult',
        _id: id,
        result: {
          _rpcError: true,
          code: 'INTERNAL',
          message: err.message,
          cause: { message: err.message, name: err.name },
          stack: err.stack,
        },
      });
    }
  }

  const proc = Bun.spawn([BUN, `--preload=${PRELUDE}`, FIXTURE], {
    stdio: ['pipe', 'pipe', 'pipe'],
    serialization: 'advanced',
    ipc: (raw) => {
      const wire = raw as WireMessage;
      if (wire._id === undefined) {
        handleFireAndForget(wire);
        return;
      }
      if (typeof wire.t === 'string' && wire.t.endsWith('Result')) {
        // Response to a harness-initiated call (e.g. `nestedTimezone`).
        const waiter = callWaiters.get(wire._id);
        if (waiter) {
          callWaiters.delete(wire._id);
          waiter(wire);
        }
        return;
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
    call(type, payload = {}) {
      const id = nextCallId++;
      return new Promise<WireMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          callWaiters.delete(id);
          reject(new Error(`call "${type}" timed out (id=${id})`));
        }, 15_000);
        callWaiters.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        proc.send({ t: type, _id: id, ...payload });
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

  test('a channel.implement handler can await a nested ctx.* call (drain-queue regression)', async () => {
    // Before the prelude drain-queue fix this deadlocked: the inbound
    // `nestedTimezone` RPC held the drain while awaiting the response to
    // a nested `ctx.location.timezone()`, but the response sat in the
    // queue behind it. RPC responses now dispatch synchronously, leaving
    // the drain free for the handler's continuation.
    helper = spawnWithCapabilities({
      vector: {
        grants: [{ id: 'dev.brika.location.timezone', ctxPath: 'location.timezone' }],
      },
      capabilityResponders: {
        'dev.brika.location.timezone': () => ({ timezone: 'Europe/Zurich' }),
      },
    });

    await helper.ready;
    const res = await helper.call('nestedTimezone');
    expect(res.result).toEqual({ ok: true, timezone: 'Europe/Zurich' });
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

  test('remote handler throws are typed BrikaErrors with cause + remote stack (Phase 4)', async () => {
    helper = spawnWithCapabilities({
      vector: {
        grants: [{ id: 'dev.brika.location.timezone', ctxPath: 'location.timezone' }],
      },
      capabilityResponders: {
        'dev.brika.location.timezone': () => {
          throw new TypeError('upstream returned 502');
        },
      },
    });

    await helper.ready;
    const res = await helper.runScenario('inspectRemoteError');
    expect(res.ok).toBe(true);
    // Plugin received a typed error envelope reconstructed from the wire:
    //  - code surfaces (HANDLER_THREW used to swallow it as a string)
    //  - cause carries the original TypeError message
    //  - stack contains the remote frames so debugging surfaces them
    expect(res.code).toBe('INTERNAL');
    expect(res.message as string).toContain('upstream returned 502');
    expect(res.causeMessage as string).toContain('upstream returned 502');
    expect(res.stackContainsRemote).toBe(true);
    await helper.stop();
  });
});
