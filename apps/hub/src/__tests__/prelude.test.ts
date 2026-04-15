/**
 * Prelude Integration Tests
 *
 * Spawns real Bun subprocesses with --preload to verify the hub's prelude
 * script works end-to-end: IPC message handling, timezone propagation, etc.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const BUN = process.execPath;
const PRELUDE = join(import.meta.dir, '../runtime/plugins/prelude/index.ts');
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
        }, 5_000);

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

  test('subprocess starts with prelude loaded', async () => {
    helper = spawnWithPrelude();
    const res = await helper.call('getTZ');
    // Process should be alive and responding
    expect(res.t).toBe('getTZResult');
    await helper.stop();
  });

  test('setTimezone updates process.env.TZ in subprocess', async () => {
    helper = spawnWithPrelude();

    // TZ should not be set initially (or inherited from parent)
    const before = await helper.call('getTZ');
    const parentTZ = process.env.TZ ?? null;
    expect(before.result).toEqual({ tz: parentTZ });

    // Send timezone via prelude's handler
    helper.send('setTimezone', { timezone: 'Pacific/Auckland' });

    // Small delay to let the prelude process the message
    await Bun.sleep(50);

    const after = await helper.call('getTZ');
    expect(after.result).toEqual({ tz: 'Pacific/Auckland' });

    await helper.stop();
  });

  test('setTimezone can be updated multiple times', async () => {
    helper = spawnWithPrelude();

    helper.send('setTimezone', { timezone: 'Asia/Tokyo' });
    await Bun.sleep(50);
    const first = await helper.call('getTZ');
    expect(first.result).toEqual({ tz: 'Asia/Tokyo' });

    helper.send('setTimezone', { timezone: 'America/New_York' });
    await Bun.sleep(50);
    const second = await helper.call('getTZ');
    expect(second.result).toEqual({ tz: 'America/New_York' });

    await helper.stop();
  });

  test('setTimezone with null clears process.env.TZ', async () => {
    helper = spawnWithPrelude();

    helper.send('setTimezone', { timezone: 'Asia/Tokyo' });
    await Bun.sleep(50);
    const set = await helper.call('getTZ');
    expect(set.result).toEqual({ tz: 'Asia/Tokyo' });

    helper.send('setTimezone', { timezone: null });
    await Bun.sleep(50);
    const cleared = await helper.call('getTZ');
    expect((cleared.result as { tz: string | null }).tz).toBeNull();

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
