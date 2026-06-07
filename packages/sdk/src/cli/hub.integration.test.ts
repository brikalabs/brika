/**
 * Integration test for the lean bin's loopback hub client. Spins a real
 * Bun.serve fake hub and asserts the full contract: the health probe, the
 * `${BRIKA_HOME}/cli-token` Bearer auth, the `/api/registry/install` body shape,
 * and SSE success/error handling.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hubOrigin, installViaRegistry, pingHub } from './hub';

const TOKEN = 'deadbeefcafef00d';

let server: ReturnType<typeof Bun.serve>;
let home: string;
const env = {
  host: process.env.BRIKA_HOST,
  port: process.env.BRIKA_PORT,
  home: process.env.BRIKA_HOME,
};

/** What the fake hub last received on /api/registry/install. */
let received: { auth: string | null; body: { package?: string; version?: string } };

function sseFrames(frames: ReadonlyArray<Record<string, unknown>>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const f of frames) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'brika-hub-'));
  await writeFile(join(home, 'cli-token'), TOKEN);

  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/health') {
        return new Response('ok');
      }
      if (url.pathname === '/api/registry/install' && req.method === 'POST') {
        const body: { package?: string; version?: string } = await req.json();
        received = { auth: req.headers.get('authorization'), body };
        if (body.package === 'boom') {
          return sseFrames([{ phase: 'installing' }, { phase: 'error', error: 'kaboom' }]);
        }
        return sseFrames([
          { phase: 'installing', message: 'resolving' },
          { phase: 'done', message: 'installed' },
        ]);
      }
      return new Response('not found', { status: 404 });
    },
  });

  process.env.BRIKA_HOST = '127.0.0.1';
  process.env.BRIKA_PORT = String(server.port);
  process.env.BRIKA_HOME = home;
});

afterAll(async () => {
  server.stop(true);
  process.env.BRIKA_HOST = env.host;
  process.env.BRIKA_PORT = env.port;
  process.env.BRIKA_HOME = env.home;
  await rm(home, { recursive: true, force: true });
});

describe('hub client', () => {
  test('hubOrigin honors BRIKA_HOST / BRIKA_PORT', () => {
    expect(hubOrigin()).toBe(`http://127.0.0.1:${server.port}`);
  });

  test('pingHub is true when a hub answers /api/health', async () => {
    expect(await pingHub()).toBe(true);
  });

  test('pingHub is false when nothing is listening', async () => {
    const port = process.env.BRIKA_PORT;
    process.env.BRIKA_PORT = '1'; // privileged + closed: connection refused
    try {
      expect(await pingHub()).toBe(false);
    } finally {
      process.env.BRIKA_PORT = port;
    }
  });

  test('installViaRegistry attaches the Bearer token and sends the package/version', async () => {
    await installViaRegistry('foo', 'file:/x/foo');
    expect(received.auth).toBe(`Bearer ${TOKEN}`);
    expect(received.body).toEqual({ package: 'foo', version: 'file:/x/foo' });
  });

  test('installViaRegistry omits version when not given', async () => {
    await installViaRegistry('bar');
    expect(received.body).toEqual({ package: 'bar' });
  });

  test('installViaRegistry throws on an error SSE frame', async () => {
    await expect(installViaRegistry('boom')).rejects.toThrow(/kaboom/);
  });
});
