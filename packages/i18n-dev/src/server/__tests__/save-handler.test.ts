import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { useBunMock } from '@brika/testing';
import { createSaveHandlerMiddleware, type SaveHandlerOptions } from '../save-handler';

interface LoggerCalls {
  readonly info: string[];
  readonly error: string[];
}

function createLogger(): { logger: SaveHandlerOptions['logger']; calls: LoggerCalls } {
  const calls: LoggerCalls = { info: [], error: [] };
  return {
    logger: {
      info: (msg: string) => {
        calls.info.push(msg);
      },
      error: (msg: string) => {
        calls.error.push(msg);
      },
    },
    calls,
  };
}

interface MountedServer {
  readonly url: string;
  readonly host: string;
  close(): Promise<void>;
}

function notFound(_req: unknown, res: { statusCode: number; end(body: string): void }): void {
  res.statusCode = 404;
  res.end('not found');
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolveClose, rejectClose) => {
    server.close((err) => (err ? rejectClose(err) : resolveClose()));
  });
}

function listenOn(server: Server): Promise<AddressInfo> {
  return new Promise<AddressInfo>((resolveListen, rejectListen) => {
    server.on('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        rejectListen(new Error('server bound to non-tcp address'));
        return;
      }
      resolveListen(addr);
    });
  });
}

async function mountMiddleware(options: SaveHandlerOptions): Promise<MountedServer> {
  const middleware = createSaveHandlerMiddleware(options);
  const server: Server = createServer((req, res) => {
    middleware(req, res, () => notFound(req, res));
  });
  const info = await listenOn(server);
  const host = `127.0.0.1:${info.port}`;
  return {
    url: `http://${host}`,
    host,
    close: () => closeServer(server),
  };
}

async function writeLocaleFile(
  root: string,
  locale: string,
  ns: string,
  content: Record<string, unknown>,
  indent: string | number = 2
): Promise<string> {
  const filePath = join(root, locale, `${ns}.json`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(content, null, indent));
  return filePath;
}

interface PostOpts {
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly method?: string;
  readonly path?: string;
  readonly rawBody?: string;
}

const realFetch = globalThis.fetch;

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function passThroughExcept(
  hubHost: string,
  hubHandler: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>
): (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch> {
  return (input, init) => {
    if (urlOf(input).includes(hubHost)) {
      return hubHandler(input, init);
    }
    return realFetch(input, init);
  };
}

async function callMiddleware(server: MountedServer, opts: PostOpts = {}): Promise<Response> {
  const path = opts.path ?? '/__i18n-write';
  const headers: Record<string, string> = {
    origin: server.url,
    'content-type': 'application/json',
    ...opts.headers,
  };
  let body: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
  }
  return fetch(`${server.url}${path}`, {
    method: opts.method ?? 'POST',
    headers,
    body,
  });
}

describe('createSaveHandlerMiddleware', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'save-handler-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  describe('routing & request shape', () => {
    test('falls through to next() for URLs outside /__i18n-write', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await fetch(`${server.url}/__other`);
        expect(res.status).toBe(404);
        expect(await res.text()).toBe('not found');
      } finally {
        await server.close();
      }
    });

    test('rejects non-POST methods with 405', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, { method: 'GET' });
        expect(res.status).toBe(405);
        const body = await res.json();
        expect(body).toEqual({ error: 'method not allowed' });
      } finally {
        await server.close();
      }
    });
  });

  describe('same-origin enforcement', () => {
    test('rejects requests with neither Origin nor Referer header', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        // fetch's default no-cors browser semantics don't apply server-to-server,
        // so we can omit both headers explicitly.
        const res = await fetch(`${server.url}/__i18n-write`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: 'en', namespace: 'common', key: 'x', value: 'y' }),
        });
        expect(res.status).toBe(403);
      } finally {
        await server.close();
      }
    });

    test('rejects requests whose Origin host does not match Host', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          headers: { origin: 'http://evil.example.com' },
          body: { locale: 'en', namespace: 'common', key: 'x', value: 'y' },
        });
        expect(res.status).toBe(403);
      } finally {
        await server.close();
      }
    });

    test('rejects requests whose Origin is a malformed URL', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          headers: { origin: 'not a url' },
          body: { locale: 'en', namespace: 'common', key: 'x', value: 'y' },
        });
        expect(res.status).toBe(403);
      } finally {
        await server.close();
      }
    });

    test('accepts requests when only Referer is present and matches', async () => {
      const { logger } = createLogger();
      await writeLocaleFile(workDir, 'en', 'common', { a: 'A' });
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await fetch(`${server.url}/__i18n-write`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            referer: `${server.url}/some/page`,
          },
          body: JSON.stringify({ locale: 'en', namespace: 'common', key: 'a', value: 'A2' }),
        });
        expect(res.status).toBe(200);
      } finally {
        await server.close();
      }
    });
  });

  describe('payload validation', () => {
    test('rejects malformed JSON bodies with 400', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, { rawBody: '{not json' });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toEqual({ error: 'invalid JSON' });
      } finally {
        await server.close();
      }
    });

    test('rejects payloads that fail the zod schema (bad locale chars)', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: '../etc', namespace: 'passwd', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('invalid locale');
      } finally {
        await server.close();
      }
    });

    test('rejects payloads with an empty key after trim', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: '   ', value: 'v' },
        });
        expect(res.status).toBe(400);
      } finally {
        await server.close();
      }
    });

    test('rejects payloads whose value exceeds the 10kB ceiling', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const oversized = 'x'.repeat(10_001);
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'k', value: oversized },
        });
        expect(res.status).toBe(400);
      } finally {
        await server.close();
      }
    });
  });

  describe('local write path', () => {
    test('persists a flat key into an existing namespace file', async () => {
      const { logger, calls } = createLogger();
      await writeLocaleFile(workDir, 'en', 'common', { hello: 'Hello' });
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'farewell', value: 'Bye' },
        });
        expect(res.status).toBe(200);
        const stored = JSON.parse(await readFile(join(workDir, 'en', 'common.json'), 'utf-8'));
        expect(stored).toEqual({ hello: 'Hello', farewell: 'Bye' });
        expect(calls.info[0]).toContain('[i18n-dev] saved common:farewell [en]');
      } finally {
        await server.close();
      }
    });

    test('walks nested dot paths and creates intermediate objects', async () => {
      const { logger } = createLogger();
      await writeLocaleFile(workDir, 'en', 'dash', { existing: 'ok' });
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'dash', key: 'header.title', value: 'Hi' },
        });
        expect(res.status).toBe(200);
        const stored = JSON.parse(await readFile(join(workDir, 'en', 'dash.json'), 'utf-8'));
        expect(stored).toEqual({ existing: 'ok', header: { title: 'Hi' } });
      } finally {
        await server.close();
      }
    });

    test('rejects writes targeting prototype-chain segments with 400', async () => {
      const { logger, calls } = createLogger();
      await writeLocaleFile(workDir, 'en', 'common', {});
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: '__proto__.poisoned', value: 'x' },
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('__proto__');
        expect(calls.error[0]).toContain('save failed');
      } finally {
        await server.close();
      }
    });

    test('returns 404 when the target namespace file does not exist', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'missing', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain('not found');
      } finally {
        await server.close();
      }
    });

    test('returns 500 when the existing file is not a JSON object', async () => {
      const { logger } = createLogger();
      const filePath = join(workDir, 'en', 'broken.json');
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, '"just a string"');
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'broken', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toContain('not a JSON object');
      } finally {
        await server.close();
      }
    });

    test('refuses to follow symlinks that escape localesDir', async () => {
      const { logger } = createLogger();
      const outside = join(workDir, 'outside');
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, 'secret.json'), '{"k":"v"}');

      const root = join(workDir, 'locales');
      await mkdir(join(root, 'en'), { recursive: true });
      // Create a symlink inside the locales dir that points outside it.
      await symlink(join(outside, 'secret.json'), join(root, 'en', 'common.json'));

      const server = await mountMiddleware({ localesDir: root, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'k', value: 'updated' },
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain('escapes localesDir');
      } finally {
        await server.close();
      }
    });

    test('preserves tab indentation when rewriting a tab-indented file', async () => {
      const { logger } = createLogger();
      const filePath = join(workDir, 'en', 'tabs.json');
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, '{\n\t"hello": "Hello"\n}\n');
      const server = await mountMiddleware({ localesDir: workDir, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'tabs', key: 'world', value: 'World' },
        });
        expect(res.status).toBe(200);
        const raw = await readFile(filePath, 'utf-8');
        expect(raw.includes('\t"hello"')).toBe(true);
        expect(raw.includes('\t"world"')).toBe(true);
      } finally {
        await server.close();
      }
    });
  });

  describe('remote write path', () => {
    const bun = useBunMock();

    test('forwards the write through fetch when localesDir is null and apiUrl is set', async () => {
      const calls: { url: string; body: string }[] = [];
      bun.fetch(
        passThroughExcept('hub.local', async (input, init) => {
          const body = typeof init?.body === 'string' ? init.body : '';
          calls.push({ url: urlOf(input), body });
          return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        })
      );

      const { logger } = createLogger();
      const server = await mountMiddleware({
        localesDir: null,
        apiUrl: 'http://hub.local/api/i18n',
        logger,
      });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe('http://hub.local/api/i18n/sources/common/en');
        expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ key: 'k', value: 'v' });
      } finally {
        await server.close();
      }
    });

    test('encodes namespace and locale path segments for the hub URL', async () => {
      const seen: string[] = [];
      bun.fetch(
        passThroughExcept('hub.local', async (input) => {
          seen.push(urlOf(input));
          return new Response('{}', { status: 200 });
        })
      );
      const { logger } = createLogger();
      const server = await mountMiddleware({
        localesDir: null,
        apiUrl: 'http://hub.local/api/i18n',
        logger,
      });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'plugin:@scope+pkg', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(200);
        expect(seen[0]).toContain('/sources/plugin%3A%40scope%2Bpkg/en');
      } finally {
        await server.close();
      }
    });

    test('relays the hub status and detail text on non-2xx responses', async () => {
      bun.fetch(
        passThroughExcept('hub.local', async () => new Response('locale frozen', { status: 409 }))
      );
      const { logger } = createLogger();
      const server = await mountMiddleware({
        localesDir: null,
        apiUrl: 'http://hub.local/api/i18n',
        logger,
      });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain('HTTP 409');
        expect(body.error).toContain('locale frozen');
      } finally {
        await server.close();
      }
    });

    test('returns 502 when the hub fetch throws (network down)', async () => {
      bun.fetch(
        passThroughExcept('hub.local', async () => {
          throw new Error('connection refused');
        })
      );
      const { logger } = createLogger();
      const server = await mountMiddleware({
        localesDir: null,
        apiUrl: 'http://hub.local/api/i18n',
        logger,
      });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toBe('connection refused');
      } finally {
        await server.close();
      }
    });
  });

  describe('no writer configured', () => {
    test('returns 503 when neither localesDir nor apiUrl is set', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ localesDir: null, apiUrl: null, logger });
      try {
        const res = await callMiddleware(server, {
          body: { locale: 'en', namespace: 'common', key: 'k', value: 'v' },
        });
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error).toBe('no writer configured');
      } finally {
        await server.close();
      }
    });
  });
});
