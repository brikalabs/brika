import { afterEach, describe, expect, test } from 'bun:test';
import { listListeningPorts, waitForListeningPort } from './port-detect';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) {
      await fn();
    }
  }
});

/**
 * Spawn a tiny Bun child that binds `port` and sleeps; returns its
 * PID. Useful for letting port-detect inspect a real process's open
 * sockets without coupling to a workspace package.
 */
function spawnListener(port: number): number {
  const proc = Bun.spawn(
    [
      'bun',
      '-e',
      `Bun.serve({ port: ${port}, fetch: () => new Response('ok') }); await Bun.sleep(60000)`,
    ],
    { stdout: 'ignore', stderr: 'ignore' }
  );
  cleanups.push(() => {
    proc.kill('SIGKILL');
  });
  if (proc.pid === undefined) {
    throw new Error('Bun.spawn did not assign a pid');
  }
  return proc.pid;
}

describe('listListeningPorts', () => {
  test('returns the bound port for a listening child', async () => {
    const port = 7500 + Math.floor(Math.random() * 200);
    const pid = spawnListener(port);
    // Give the child a moment to bind before we ask lsof.
    for (let i = 0; i < 20; i++) {
      const ports = await listListeningPorts(pid);
      if (ports.includes(port)) {
        return;
      }
      await Bun.sleep(100);
    }
    throw new Error(`port ${port} never showed up for pid ${pid}`);
  });

  test('returns empty array for a process bound to no ports', async () => {
    const proc = Bun.spawn(['bun', '-e', 'await Bun.sleep(60000)'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    cleanups.push(() => {
      proc.kill('SIGKILL');
    });
    if (proc.pid === undefined) {
      throw new Error('no pid');
    }
    expect(await listListeningPorts(proc.pid)).toEqual([]);
  });
});

describe('waitForListeningPort', () => {
  test('resolves with the port once it appears', async () => {
    const port = 7800 + Math.floor(Math.random() * 200);
    const pid = spawnListener(port);
    const found = await waitForListeningPort(pid, 10_000);
    expect(found).toBe(port);
  });

  test('rejects when the timeout elapses with no listener', async () => {
    const proc = Bun.spawn(['bun', '-e', 'await Bun.sleep(60000)'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    cleanups.push(() => {
      proc.kill('SIGKILL');
    });
    if (proc.pid === undefined) {
      throw new Error('no pid');
    }
    await expect(waitForListeningPort(proc.pid, 600)).rejects.toThrow(/Timed out/);
  });

  test('rejects when the abort signal trips', async () => {
    const proc = Bun.spawn(['bun', '-e', 'await Bun.sleep(60000)'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    cleanups.push(() => {
      proc.kill('SIGKILL');
    });
    if (proc.pid === undefined) {
      throw new Error('no pid');
    }
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 150);
    await expect(waitForListeningPort(proc.pid, 10_000, ac.signal)).rejects.toThrow(/aborted/);
  });

  test('aborts immediately when the signal is already triggered', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(waitForListeningPort(1, 5_000, ac.signal)).rejects.toThrow(/aborted/);
  });
});
