/**
 * Tests for logs HTTP routes
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { logsRoutes } from '@/runtime/http/routes/logs';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';
import { PluginManager } from '@/runtime/plugins/plugin-manager';

describe('logs routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockLogStore: {
    query: ReturnType<typeof mock>;
    clear: ReturnType<typeof mock>;
    count: ReturnType<typeof mock>;
    getPluginNames: ReturnType<typeof mock>;
    getSources: ReturnType<typeof mock>;
  };
  let mockPluginManager: {
    list: ReturnType<typeof mock>;
  };
  let mockLogger: {
    query: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockLogStore = {
      query: mock().mockReturnValue({ logs: [], nextCursor: null }),
      clear: mock().mockReturnValue(0),
      count: mock().mockReturnValue(0),
      getPluginNames: mock().mockReturnValue([]),
      getSources: mock().mockReturnValue([]),
    };
    mockLogger = {
      query: mock().mockReturnValue([]),
    };
    mockPluginManager = {
      list: mock().mockReturnValue([]),
    };
    stub(LogStore, mockLogStore);
    stub(Logger, mockLogger);
    stub(PluginManager, mockPluginManager);
    app = TestApp.create(logsRoutes);
  });

  test('GET /api/logs returns logs', async () => {
    const res = await app.get('/api/logs');

    expect(res.status).toBe(200);
  });

  test('GET /api/logs with query parameters', async () => {
    mockLogStore.query.mockReturnValue({ logs: [{ id: 1, message: 'test' }], nextCursor: 5 });

    const res = await app.get('/api/logs?level=info&limit=50&order=asc');

    expect(res.status).toBe(200);
    expect(mockLogStore.query).toHaveBeenCalled();
  });

  test('GET /api/logs/recent returns ring buffer', async () => {
    mockLogger.query.mockReturnValue([{ ts: 1000, level: 'info', message: 'test' }]);

    const res = await app.get('/api/logs/recent');

    expect(res.status).toBe(200);
  });

  test('GET /api/logs/plugins returns plugin names with metadata', async () => {
    mockLogStore.getPluginNames.mockReturnValue(['@test/plugin-a', '@test/plugin-b']);
    mockPluginManager.list.mockReturnValue([
      { name: '@test/plugin-a', uid: 'uid-a', version: '1.0.0' },
      { name: '@test/plugin-b', uid: 'uid-b', version: '2.0.0' },
    ]);

    const res = await app.get<{ plugins: Array<{ name: string; uid?: string; version?: string }> }>(
      '/api/logs/plugins'
    );

    expect(res.status).toBe(200);
    expect(res.body.plugins).toHaveLength(2);
    expect(res.body.plugins[0].name).toBe('@test/plugin-a');
    expect(res.body.plugins[0].uid).toBe('uid-a');
    expect(res.body.plugins[0].version).toBe('1.0.0');
    expect(res.body.plugins[1].name).toBe('@test/plugin-b');
  });

  test('GET /api/logs/plugins handles unknown plugins', async () => {
    mockLogStore.getPluginNames.mockReturnValue(['@test/unknown-plugin']);
    mockPluginManager.list.mockReturnValue([]);

    const res = await app.get<{ plugins: Array<{ name: string; uid?: string; version?: string }> }>(
      '/api/logs/plugins'
    );

    expect(res.status).toBe(200);
    expect(res.body.plugins).toHaveLength(1);
    expect(res.body.plugins[0].name).toBe('@test/unknown-plugin');
    expect(res.body.plugins[0].uid).toBeUndefined();
    expect(res.body.plugins[0].version).toBeUndefined();
  });

  test('GET /api/logs/stats returns log statistics', async () => {
    mockLogStore.count.mockReturnValue(42);
    mockLogger.query.mockReturnValue([1, 2, 3]);

    const res = await app.get<{ total: number; ringBufferSize: number }>('/api/logs/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(42);
    expect(res.body.ringBufferSize).toBe(3);
  });

  test('GET /api/logs/sources returns all and used sources', async () => {
    mockLogStore.getSources.mockReturnValue(['hub', 'plugin']);

    const res = await app.get<{ all: string[]; used: string[] }>('/api/logs/sources');

    expect(res.status).toBe(200);
    expect(res.body.all).toBeDefined();
    expect(res.body.used).toEqual(['hub', 'plugin']);
  });

  test('GET /api/logs/levels returns log levels', async () => {
    const res = await app.get<{ all: string[] }>('/api/logs/levels');

    expect(res.status).toBe(200);
    expect(res.body.all).toEqual(['debug', 'info', 'warn', 'error']);
  });

  test('DELETE /api/logs clears logs', async () => {
    mockLogStore.clear.mockReturnValue(10);

    const res = await app.delete<{ ok: boolean; deleted: number }>('/api/logs');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(res.body.deleted).toBe(10);
  });

  test('DELETE /api/logs with filter body', async () => {
    mockLogStore.clear.mockReturnValue(5);

    const res = await app.delete<{ ok: boolean; deleted: number }>('/api/logs');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(res.body.deleted).toBe(5);
    expect(mockLogStore.clear).toHaveBeenCalled();
  });
});
