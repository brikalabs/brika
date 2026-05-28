/**
 * Prelude Integration Tests
 *
 * Spawns real Bun subprocesses with --preload to verify the hub's prelude
 * script works end-to-end: IPC message handling, timezone propagation, etc.
 */

import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

// Subprocess tests are slow under parallel load — allow up to 30s per test
setDefaultTimeout(30_000);

import { join } from 'node:path';
import { sleep } from '@brika/testing';

const BUN = process.execPath;
const PRELUDE = join(import.meta.dir, 'runtime/plugins/prelude/index.ts');
const FIXTURE = join(import.meta.dir, 'fixtures/prelude-test-plugin.ts');

interface WireMessage {
  t: string;
  _id?: number;
  [key: string]: unknown;
}

/**
 * Spawn a subprocess with the prelude loaded, returning helpers
 * to send IPC messages and wait for responses.
 */
function spawnWithPrelude() {
  const handlers = new Map<number, (msg: WireMessage) => void>();
  let nextId = 1;

  const proc = Bun.spawn([BUN, `--preload=${PRELUDE}`, FIXTURE], {
    stdio: ['pipe', 'pipe', 'pipe'],
    serialization: 'advanced',
    ipc: (msg) => {
      const wire = msg as WireMessage;
      if (wire._id !== undefined) {
        const handler = handlers.get(wire._id);
        if (handler) {
          handlers.delete(wire._id);
          handler(wire);
        }
      }
    },
  });

  return {
    proc,

    /** Send a message and wait for a response with matching `_id`. */
    call(type: string, payload: Record<string, unknown> = {}): Promise<WireMessage> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          handlers.delete(id);
          reject(new Error(`IPC call "${type}" timed out (id=${id})`));
        }, 15_000);

        handlers.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });

        proc.send({ t: type, _id: id, ...payload });
      });
    },

    /** Send a fire-and-forget message. */
    send(type: string, payload: Record<string, unknown> = {}) {
      proc.send({ t: type, ...payload });
    },

    /** Gracefully stop the subprocess. */
    async stop() {
      proc.send({ t: 'stop' });
      await proc.exited;
    },
  };
}

describe('Prelude', () => {
  let helper: ReturnType<typeof spawnWithPrelude> | null = null;

  afterEach(async () => {
    if (!helper) {
      return;
    }
    const proc = helper.proc;
    helper = null;
    try {
      // SIGKILL (9) so a child ignoring SIGTERM can't keep the test alive,
      // and race the wait against a short ceiling so a stuck `proc.exited`
      // doesn't pin the whole runner.
      proc.kill(9);
      // Ceiling — guard against a stuck `proc.exited` (negative wait).
      await Promise.race([proc.exited, sleep(500)]);
    } catch {
      // already dead
    }
  });

  test('subprocess starts with prelude loaded', async () => {
    helper = spawnWithPrelude();
    const res = await helper.call('getTZ');
    // Process should be alive and responding
    expect(res.t).toBe('getTZResult');
    await helper.stop();
  });

  /**
   * `setTimezone` is fire-and-forget; we have to wait for the subprocess
   * to process it before the next `getTZ` returns the new value. A
   * fixed sleep is flaky under CI load — poll-with-backoff up to a
   * generous ceiling instead. The total wall time when things go well
   * stays in single-digit ms.
   */
  async function waitForTimezone(
    h: ReturnType<typeof spawnWithPrelude>,
    expected: string | null,
    timeoutMs = 5_000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let delay = 5;
    while (Date.now() < deadline) {
      const tz = (await h.call('getTZ')).result as { tz: string | null };
      if (tz.tz === expected) {
        return;
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 200);
    }
    throw new Error(`Timed out waiting for timezone to become ${expected}`);
  }

  test('setTimezone updates process.env.TZ in subprocess', async () => {
    helper = spawnWithPrelude();

    // TZ should not be set initially (or inherited from parent)
    const before = await helper.call('getTZ');
    const parentTZ = process.env.TZ ?? null;
    expect(before.result).toEqual({ tz: parentTZ });

    helper.send('setTimezone', { timezone: 'Pacific/Auckland' });
    await waitForTimezone(helper, 'Pacific/Auckland');

    await helper.stop();
  });

  test('setTimezone can be updated multiple times', async () => {
    helper = spawnWithPrelude();

    helper.send('setTimezone', { timezone: 'Asia/Tokyo' });
    await waitForTimezone(helper, 'Asia/Tokyo');

    helper.send('setTimezone', { timezone: 'America/New_York' });
    await waitForTimezone(helper, 'America/New_York');

    await helper.stop();
  });

  test('setTimezone with null clears process.env.TZ', async () => {
    helper = spawnWithPrelude();

    helper.send('setTimezone', { timezone: 'Asia/Tokyo' });
    await waitForTimezone(helper, 'Asia/Tokyo');

    helper.send('setTimezone', { timezone: null });
    await waitForTimezone(helper, null);

    await helper.stop();
  });

  test('setTimezone ignores invalid payload', async () => {
    helper = spawnWithPrelude();

    const before = await helper.call('getTZ');
    const initialTZ = (before.result as { tz: string | null }).tz;

    // Send with non-string timezone - should be ignored
    helper.send('setTimezone', { timezone: 123 as unknown as string });
    await Bun.sleep(50);

    const after = await helper.call('getTZ');
    expect((after.result as { tz: string | null }).tz).toBe(initialTZ);

    await helper.stop();
  });

  test('subprocess exits cleanly on stop', async () => {
    helper = spawnWithPrelude();

    // Verify it's alive
    await helper.call('getTZ');

    helper.send('stop');
    const code = await helper.proc.exited;
    expect(code).toBe(0);
    helper = null; // already stopped
  });
});
