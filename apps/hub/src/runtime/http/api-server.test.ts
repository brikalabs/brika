/**
 * Tests for ApiServer lifecycle — specifically the graceful `stop()` that
 * drains in-flight requests and its force-close fallback.
 *
 * We avoid binding a real socket by stubbing `Bun.serve` with a fake server
 * that records how `stop` was called, so the draining vs. force-close branch
 * can be asserted deterministically.
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { HubConfig } from '@/runtime/config';
import { ApiServer } from '@/runtime/http/api-server';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({
  autoStub: false,
});

describe('ApiServer.stop', () => {
  const originalServe = Bun.serve;
  let serverStop: ReturnType<typeof mock>;

  beforeEach(() => {
    stub(Logger, { withSource: () => stub(Logger) });
    stub(HubConfig, {
      host: '127.0.0.1',
      port: 0,
      devUiProxy: '',
      maxRequestBodyBytes: 1024,
      corsAllowlist: [],
    });

    serverStop = mock((_force?: boolean) => Promise.resolve());
    // Replace Bun.serve so start() never binds a real socket; the returned
    // fake exposes the same stop(force) contract we delegate to.
    Bun.serve = mock(() => ({ stop: serverStop, port: 1234 })) as unknown as typeof Bun.serve;
  });

  afterEach(() => {
    Bun.serve = originalServe;
  });

  test('stop() before start() is a harmless no-op', async () => {
    const server = get(ApiServer);
    await expect(server.stop()).resolves.toBeUndefined();
    expect(serverStop).not.toHaveBeenCalled();
  });

  test('graceful stop drains in-flight requests (force defaults to false)', async () => {
    const server = get(ApiServer);
    server.start();

    await server.stop();

    expect(serverStop).toHaveBeenCalledTimes(1);
    expect(serverStop).toHaveBeenCalledWith(false);
  });

  test('forced stop closes active connections immediately', async () => {
    const server = get(ApiServer);
    server.start();

    await server.stop(true);

    expect(serverStop).toHaveBeenCalledTimes(1);
    expect(serverStop).toHaveBeenCalledWith(true);
  });

  test('awaits the underlying server.stop so the caller can sequence teardown', async () => {
    let resolved = false;
    serverStop = mock(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve();
          }, 5);
        })
    );
    Bun.serve = mock(() => ({ stop: serverStop, port: 1234 })) as unknown as typeof Bun.serve;

    const server = get(ApiServer);
    server.start();

    await server.stop();

    // The promise must not resolve before the underlying drain completes.
    expect(resolved).toBe(true);
  });
});
