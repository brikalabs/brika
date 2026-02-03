import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { EventSystem } from '@/runtime/events/event-system';
import { sparksRoutes } from '@/runtime/http/routes/sparks';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { SparkStore } from '@/runtime/sparks/spark-store';

describe('sparks routes', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(SparkRegistry, { list: () => [], get: () => undefined });
    stub(SparkStore, { query: () => ({ sparks: [], nextCursor: null }) });
    stub(EventSystem);
    app = TestApp.create(sparksRoutes);
  });

  test('GET /api/sparks returns list', async () => {
    const res = await app.get('/api/sparks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTrue();
  });

  test('GET /api/sparks/history returns history', async () => {
    const res = await app.get<{ sparks: unknown[]; nextCursor: unknown }>('/api/sparks/history');

    expect(res.status).toBe(200);
    expect(res.body.sparks).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  test('GET /api/sparks/:type returns 404 for unknown spark', async () => {
    const res = await app.get('/api/sparks/unknown:spark');

    expect(res.status).toBe(404);
  });

  test('POST /api/sparks/emit emits event', async () => {
    const res = await app.post<{ type: string; source: string }>('/api/sparks/emit', {
      type: 'test:event',
    });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('test:event');
    expect(res.body.source).toBe('debug');
  });

  test('POST /api/sparks/emit returns 400 for missing type', async () => {
    const res = await app.post('/api/sparks/emit', {});

    expect(res.status).toBe(400);
  });
});
