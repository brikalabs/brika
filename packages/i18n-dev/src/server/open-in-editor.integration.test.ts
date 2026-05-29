import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { flush, waitFor } from '@brika/testing';
import { createOpenInEditorMiddleware, type OpenInEditorOptions } from './open-in-editor';

interface MountedServer {
  readonly url: string;
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

async function mountMiddleware(options: OpenInEditorOptions): Promise<MountedServer> {
  const middleware = createOpenInEditorMiddleware(options);
  const server: Server = createServer((req, res) => {
    middleware(req, res, () => notFound(req, res));
  });
  const info = await listenOn(server);
  return {
    url: `http://127.0.0.1:${info.port}`,
    close: () => closeServer(server),
  };
}

interface Logged {
  readonly warn: string[];
}

function createLogger(): { logger: OpenInEditorOptions['logger']; calls: Logged } {
  const calls: Logged = { warn: [] };
  return {
    logger: {
      warn: (msg: string) => {
        calls.warn.push(msg);
      },
    },
    calls,
  };
}

async function callOpen(
  server: MountedServer,
  opts: { file?: string; method?: string; headers?: Record<string, string>; path?: string } = {}
): Promise<Response> {
  const path = opts.path ?? '/__open-in-editor';
  const search = opts.file === undefined ? '' : `?file=${encodeURIComponent(opts.file)}`;
  const headers: Record<string, string> = {
    origin: server.url,
    ...opts.headers,
  };
  return fetch(`${server.url}${path}${search}`, {
    method: opts.method ?? 'POST',
    headers,
  });
}

describe('createOpenInEditorMiddleware', () => {
  let workDir: string;
  let viteRoot: string;
  let workspaceRoot: string;
  let savedEditor: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'open-editor-'));
    // Use realpath: on macOS, tmpdir() returns /var/folders/... which is a
    // symlink to /private/var/folders/... — without resolving we'd fail our
    // own containment check.
    viteRoot = realpathSync(await mkdtemp(join(workDir, 'vite-')));
    workspaceRoot = realpathSync(await mkdtemp(join(workDir, 'ws-')));

    // Force LAUNCH_EDITOR to a harmless command so execFile never spawns a
    // real editor during the test run. `true` exits 0 with no output.
    savedEditor = process.env.LAUNCH_EDITOR;
    process.env.LAUNCH_EDITOR = 'true';
  });

  afterEach(async () => {
    if (savedEditor === undefined) {
      delete process.env.LAUNCH_EDITOR;
    } else {
      process.env.LAUNCH_EDITOR = savedEditor;
    }
    await rm(workDir, { recursive: true, force: true });
  });

  describe('routing & method gate', () => {
    test('falls through to next() for URLs outside /__open-in-editor', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await fetch(`${server.url}/__other`);
        expect(res.status).toBe(404);
        expect(await res.text()).toBe('not found');
      } finally {
        await server.close();
      }
    });

    test('rejects GET with 405 and an Allow: POST header', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { method: 'GET', file: 'whatever' });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST');
      } finally {
        await server.close();
      }
    });
  });

  describe('same-origin enforcement', () => {
    test('rejects requests with no Origin and no Referer header', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await fetch(`${server.url}/__open-in-editor?file=x.ts`, { method: 'POST' });
        expect(res.status).toBe(403);
      } finally {
        await server.close();
      }
    });

    test('rejects requests with a cross-origin Origin header', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, {
          file: 'x.ts',
          headers: { origin: 'http://evil.example.com' },
        });
        expect(res.status).toBe(403);
      } finally {
        await server.close();
      }
    });

    test('rejects requests whose Origin header is not a parseable URL', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, {
          file: 'x.ts',
          headers: { origin: 'http://[::1' },
        });
        expect(res.status).toBe(403);
      } finally {
        await server.close();
      }
    });
  });

  describe('file param validation', () => {
    test('returns 400 when the file param is missing entirely', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server);
        expect(res.status).toBe(400);
        expect(await res.text()).toBe('Missing file parameter');
      } finally {
        await server.close();
      }
    });

    test('rejects absolute paths outside both roots with 400', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: '/etc/passwd' });
        expect(res.status).toBe(400);
        expect(await res.text()).toBe('Path outside allowed roots');
      } finally {
        await server.close();
      }
    });

    test('rejects relative paths whose resolved location does not exist anywhere', async () => {
      const { logger } = createLogger();
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'does/not/exist.ts' });
        expect(res.status).toBe(400);
      } finally {
        await server.close();
      }
    });
  });

  describe('resolution', () => {
    test('accepts a relative file existing inside viteRoot', async () => {
      const { logger } = createLogger();
      const target = join(viteRoot, 'src', 'foo.ts');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, '// ok');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'src/foo.ts' });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('OK');
      } finally {
        await server.close();
      }
    });

    test('accepts a relative file existing inside workspaceRoot (workspace wins over vite)', async () => {
      const { logger } = createLogger();
      const target = join(workspaceRoot, 'packages', 'foo.ts');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, '// ok');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'packages/foo.ts' });
        expect(res.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    test('accepts an absolute path that resides inside viteRoot', async () => {
      const { logger } = createLogger();
      const target = join(viteRoot, 'bar.ts');
      await writeFile(target, '// ok');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: target });
        expect(res.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    test('preserves a :line suffix while still resolving the bare file', async () => {
      const { logger } = createLogger();
      const target = join(viteRoot, 'src', 'lined.ts');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, 'line 1\nline 2');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'src/lined.ts:7' });
        expect(res.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    test('preserves a :line:col suffix the same way', async () => {
      const { logger } = createLogger();
      const target = join(viteRoot, 'src', 'lined.ts');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, 'line 1');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'src/lined.ts:7:3' });
        expect(res.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    test('rejects a symlink whose realpath escapes both allowed roots', async () => {
      const { logger } = createLogger();
      const outside = join(workDir, 'outside-everything');
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, 'secret.txt'), 'hush');

      const linkPath = join(viteRoot, 'link.ts');
      await symlink(join(outside, 'secret.txt'), linkPath);

      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'link.ts' });
        expect(res.status).toBe(400);
        expect(await res.text()).toBe('Path outside allowed roots');
      } finally {
        await server.close();
      }
    });

    test('works without a workspaceRoot (null) by only checking viteRoot', async () => {
      const { logger } = createLogger();
      const target = join(viteRoot, 'only.ts');
      await writeFile(target, '// ok');
      const server = await mountMiddleware({ viteRoot, workspaceRoot: null, logger });
      try {
        const okRes = await callOpen(server, { file: 'only.ts' });
        expect(okRes.status).toBe(200);
        const badRes = await callOpen(server, { file: '/tmp' });
        expect(badRes.status).toBe(400);
      } finally {
        await server.close();
      }
    });
  });

  describe('editor invocation', () => {
    test('does not log a warning when the editor exits cleanly', async () => {
      const { logger, calls } = createLogger();
      const target = join(viteRoot, 'good.ts');
      await writeFile(target, '// ok');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'good.ts' });
        expect(res.status).toBe(200);
        // Negative assertion: give execFile a window to (not) emit a warning.
        await flush(30);
        expect(calls.warn).toHaveLength(0);
      } finally {
        await server.close();
      }
    });

    test('logs a warning when the editor binary fails to launch', async () => {
      process.env.LAUNCH_EDITOR = '/no/such/editor-binary-xyz';
      const { logger, calls } = createLogger();
      const target = join(viteRoot, 'good.ts');
      await writeFile(target, '// ok');
      const server = await mountMiddleware({ viteRoot, workspaceRoot, logger });
      try {
        const res = await callOpen(server, { file: 'good.ts' });
        expect(res.status).toBe(200);
        await waitFor(() => calls.warn.length > 0);
        expect(calls.warn.length).toBeGreaterThan(0);
        expect(calls.warn[0]).toContain('Failed to open editor');
      } finally {
        await server.close();
      }
    });
  });
});
