import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { logsRoutes } from '@/runtime/http/routes/logs';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

const di = useTestBed();

describe('logs routes', () => {
  let app: ReturnType<typeof TestApp.create>;

  beforeEach(() => {
    di.stub(LogStore, {
      query: () => ({ logs: [], nextCursor: null }),
      clear: () => 0,
      count: () => 0,
      getPluginNames: () => [],
      getSources: () => [],
    });
    di.stub(Logger);
    di.stub(PluginManager, { list: () => [] });
    app = TestApp.create(logsRoutes);
  });

  test('GET /api/logs returns logs', async () => {
    const res = await app.get('/api/logs');

    expect(res.status).toBe(200);
  });

  test('GET /api/logs/recent returns ring buffer', async () => {
    const res = await app.get('/api/logs/recent');

    expect(res.status).toBe(200);
  });

  test('GET /api/logs/levels returns log levels', async () => {
    const res = await app.get<{ all: string[] }>('/api/logs/levels');

    expect(res.status).toBe(200);
    expect(res.body.all).toEqual(['debug', 'info', 'warn', 'error']);
  });

  test('DELETE /api/logs clears logs', async () => {
    const res = await app.delete<{ ok: boolean }>('/api/logs');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
  });
});
