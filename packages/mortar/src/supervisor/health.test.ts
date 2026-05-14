import { afterEach, describe, expect, test } from 'bun:test';
import { createServer } from 'node:net';
import { waitForHttp, waitForTcp } from './health';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) {
      await fn();
    }
  }
});

function bunServe(handler: (req: Request) => Response): { port: number } {
  const server = Bun.serve({ port: 0, fetch: handler });
  cleanups.push(() => server.stop(true));
  const port = server.port;
  if (port === undefined) {
    throw new Error('Bun.serve did not assign a port');
  }
  return { port };
}

// ─── waitForHttp ────────────────────────────────────────────────────────────

describe('waitForHttp', () => {
  test('resolves immediately when the endpoint already returns 2xx', async () => {
    const server = bunServe(() => new Response('ok', { status: 200 }));
    await waitForHttp(`http://localhost:${server.port}/`, 5_000);
  });

  test('polls until the endpoint comes up', async () => {
    let ready = false;
    const server = bunServe(() => {
      if (!ready) {
        return new Response('not yet', { status: 503 });
      }
      return new Response('ok', { status: 200 });
    });
    setTimeout(() => {
      ready = true;
    }, 400);
    const start = Date.now();
    await waitForHttp(`http://localhost:${server.port}/`, 5_000);
    expect(Date.now() - start).toBeGreaterThanOrEqual(200);
  });

  test('rejects when the timeout elapses', async () => {
    const server = bunServe(() => new Response('nope', { status: 503 }));
    await expect(waitForHttp(`http://localhost:${server.port}/`, 300)).rejects.toThrow(
      /Timed out waiting for/
    );
  });

  test('rejects when the abort signal trips before success', async () => {
    const server = bunServe(() => new Response('nope', { status: 503 }));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    await expect(waitForHttp(`http://localhost:${server.port}/`, 5_000, ac.signal)).rejects.toThrow(
      /aborted/
    );
  });

  test('rejects with the last network error when nothing is listening', async () => {
    await expect(waitForHttp('http://127.0.0.1:1/', 200)).rejects.toThrow(/Timed out waiting for/);
  });

  test('aborts before the first poll when the signal is already triggered', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(waitForHttp('http://127.0.0.1:1/', 200, ac.signal)).rejects.toThrow(/aborted/);
  });
});

// ─── waitForTcp ─────────────────────────────────────────────────────────────

describe('waitForTcp', () => {
  function listenOnFreePort(): Promise<{ port: number; close: () => Promise<void> }> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('no address'));
          return;
        }
        resolve({
          port: addr.port,
          close: () =>
            new Promise<void>((res) => {
              server.close(() => res());
            }),
        });
      });
    });
  }

  test('resolves once a port accepts a connection', async () => {
    const listener = await listenOnFreePort();
    cleanups.push(() => listener.close());
    await waitForTcp(listener.port, 5_000);
  });

  test('rejects when the timeout elapses with nothing listening', async () => {
    await expect(waitForTcp(1, 300)).rejects.toThrow(/Timed out waiting for 127\.0\.0\.1:1/);
  });

  test('rejects when the abort signal trips before success', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    await expect(waitForTcp(1, 5_000, ac.signal)).rejects.toThrow(/aborted/);
  });

  test('aborts before the first poll when the signal is already triggered', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(waitForTcp(1, 200, ac.signal)).rejects.toThrow(/aborted/);
  });
});
