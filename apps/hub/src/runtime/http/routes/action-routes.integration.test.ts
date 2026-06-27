import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { z } from 'zod';
import { actionRoutes } from '@/runtime/http/routes/action-routes';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

const PLUGIN = {
  uid: 'plg-1',
  name: '@brika/plugin-timer',
};

/** Narrows an `await res.json()` body to the structured error envelope. */
const errorBody = z.object({ error: z.object({ code: z.string() }) });

describe('action routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockManager: {
    get: ReturnType<typeof mock>;
  };
  let mockLifecycle: {
    ensureStarted: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockManager = {
      get: mock().mockReturnValue(PLUGIN),
    };
    mockLifecycle = {
      ensureStarted: mock().mockReturnValue(null),
    };
    stub(PluginManager, mockManager);
    stub(PluginLifecycle, mockLifecycle);
    app = TestApp.create(actionRoutes);
  });

  test('POST /:uid/actions/:actionId returns 404 when plugin not found', async () => {
    mockManager.get.mockReturnValue(null);

    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(404);
  });

  test('POST /:uid/actions/:actionId returns 404 when plugin not running', async () => {
    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(404);
  });

  test('POST /:uid/actions/:actionId returns data on success', async () => {
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        data: {
          count: 42,
        },
      }),
    });

    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        count: 42,
      },
    });
  });

  test('POST /:uid/actions/:actionId returns 500 on action error', async () => {
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: false,
        error: 'failed',
      }),
    });

    const res = await app.post('/api/plugins/plg-1/actions/getData', {});

    expect(res.status).toBe(500);
  });

  test('returns 404 for ACTION_NOT_FOUND error code', async () => {
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: false,
        error: { message: 'no such action', code: 'ACTION_NOT_FOUND' },
      }),
    });
    const res = await app.post('/api/plugins/plg-1/actions/missing', {});
    expect(res.status).toBe(404);
  });

  test('returns binary response with X-Brika-Binary marker', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        bytes,
        contentType: 'image/png',
      }),
    });
    const res = await app.post('/api/plugins/plg-1/actions/readPng', {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-brika-binary')).toBe('1');
  });

  test('returns 403 when streamFile target fails the readFile scope', async () => {
    const denied = Object.assign(new Error('not granted'), { code: 'PERMISSION_DENIED' });
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        stream: { virtualPath: '/cache/secret.txt' },
      }),
      resolveStreamPath: mock().mockRejectedValue(denied),
    });
    const res = await app.post('/api/plugins/plg-1/actions/leak', {});
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('PERMISSION_DENIED');
  });

  test('writeStream result streams the body to disk and returns path + bytesWritten', async () => {
    const streamWriteToGrantedPath = mock().mockResolvedValue(40 * 1024 * 1024);
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        writeStream: { virtualPath: '/data/upload.dmg' },
      }),
      streamWriteToGrantedPath,
    });

    const res = await app.post('/api/plugins/plg-1/actions/writeEntry', { ignored: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { path: '/data/upload.dmg', bytesWritten: 40 * 1024 * 1024 },
    });
    // The handler was called for the sink path; the route did the write.
    expect(streamWriteToGrantedPath).toHaveBeenCalledTimes(1);
  });

  test('returns 403 when streamWrite target fails the writeFile scope', async () => {
    const denied = Object.assign(new Error('not granted'), { code: 'PERMISSION_DENIED' });
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        writeStream: { virtualPath: '/cache/evil.bin' },
      }),
      streamWriteToGrantedPath: mock().mockRejectedValue(denied),
    });

    const res = await app.post('/api/plugins/plg-1/actions/writeEntry', { ignored: true });

    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('PERMISSION_DENIED');
  });

  test('decodes the base64 meta header and streams the binary body to disk', async () => {
    // A real binary upload: octet-stream content-type, the path carried in the
    // base64 `X-Brika-Action-Meta` header (never read off the body), and the
    // raw bytes left in the request for the route to stream straight to disk.
    const callPluginAction = mock().mockResolvedValue({
      ok: true,
      writeStream: { virtualPath: '/data/Un développeur.mp3' },
    });
    const streamWriteToGrantedPath = mock().mockResolvedValue(12);
    mockLifecycle.ensureStarted.mockReturnValue({ callPluginAction, streamWriteToGrantedPath });

    const meta = Buffer.from(JSON.stringify({ path: '/data/Un développeur.mp3' }), 'utf8').toString(
      'base64'
    );
    const res = await app.hono.fetch(
      new Request('http://test/api/plugins/plg-1/actions/writeEntry', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-brika-action-meta': meta },
        body: new Uint8Array([1, 2, 3, 4]),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { path: '/data/Un développeur.mp3', bytesWritten: 12 },
    });
    // The handler saw the decoded meta, not the body bytes.
    expect(callPluginAction).toHaveBeenCalledWith('writeEntry', {
      path: '/data/Un développeur.mp3',
    });
    expect(streamWriteToGrantedPath).toHaveBeenCalledTimes(1);
  });

  test('passes undefined input when a binary request carries no meta header', async () => {
    const callPluginAction = mock().mockResolvedValue({ ok: true, data: { received: true } });
    mockLifecycle.ensureStarted.mockReturnValue({ callPluginAction });

    const res = await app.hono.fetch(
      new Request('http://test/api/plugins/plg-1/actions/noMeta', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([9]),
      })
    );

    expect(res.status).toBe(200);
    expect(callPluginAction).toHaveBeenCalledWith('noMeta', undefined);
  });

  test('treats a malformed meta header as no input', async () => {
    const callPluginAction = mock().mockResolvedValue({ ok: true, data: null });
    mockLifecycle.ensureStarted.mockReturnValue({ callPluginAction });

    const res = await app.hono.fetch(
      new Request('http://test/api/plugins/plg-1/actions/badMeta', {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-brika-action-meta': 'not-base64-json!!',
        },
        body: new Uint8Array([0]),
      })
    );

    expect(res.status).toBe(200);
    expect(callPluginAction).toHaveBeenCalledWith('badMeta', undefined);
  });

  test('returns 400 when a stream-write action receives no request body', async () => {
    mockLifecycle.ensureStarted.mockReturnValue({
      callPluginAction: mock().mockResolvedValue({
        ok: true,
        writeStream: { virtualPath: '/data/empty.bin' },
      }),
      streamWriteToGrantedPath: mock(),
    });

    const meta = Buffer.from(JSON.stringify({ path: '/data/empty.bin' }), 'utf8').toString(
      'base64'
    );
    const res = await app.hono.fetch(
      new Request('http://test/api/plugins/plg-1/actions/writeEntry', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-brika-action-meta': meta },
      })
    );

    expect(res.status).toBe(400);
    expect(errorBody.parse(await res.json()).error.code).toBe('BAD_REQUEST');
  });

  test('streams a real file straight into the HTTP response on streamFile success', async () => {
    // Write content to a temp file, point the mock resolver at it,
    // and verify the route emits it verbatim with the right headers.
    // Exercises the happy-path branch in `streamResponse`. Uses
    // text content because the TestApp helper auto-decodes the
    // response body, so we read it back as a string.
    const dir = mkdtempSync(join(tmpdir(), 'brika-action-stream-'));
    try {
      const hostPath = join(dir, 'note.txt');
      const content = 'hello brika streaming';
      writeFileSync(hostPath, content);

      mockLifecycle.ensureStarted.mockReturnValue({
        callPluginAction: mock().mockResolvedValue({
          ok: true,
          stream: { virtualPath: '/data/note.txt', contentType: 'text/plain' },
        }),
        resolveStreamPath: mock().mockResolvedValue(hostPath),
      });

      const res = await app.post<string>('/api/plugins/plg-1/actions/readNote', {});

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain');
      expect(res.headers.get('x-brika-binary')).toBe('1');
      expect(res.body).toBe(content);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
