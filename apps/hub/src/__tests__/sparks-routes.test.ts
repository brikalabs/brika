import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { EventSystem } from '@/runtime/events/event-system';
import { sparksRoutes } from '@/runtime/http/routes/sparks';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { SparkStore } from '@/runtime/sparks/spark-store';

describe('sparks routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockRegistry: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
  };
  let mockStore: {
    query: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockRegistry = {
      list: mock().mockReturnValue([]),
      get: mock().mockReturnValue(undefined),
    };
    mockStore = {
      query: mock().mockReturnValue({ sparks: [], nextCursor: null }),
    };
    stub(SparkRegistry, mockRegistry);
    stub(SparkStore, mockStore);
    stub(EventSystem);
    app = TestApp.create(sparksRoutes);
  });

  test('GET /api/sparks returns list', async () => {
    const res = await app.get('/api/sparks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTrue();
  });

  test('GET /api/sparks returns mapped spark fields', async () => {
    mockRegistry.list.mockReturnValue([
      {
        type: 'test:spark',
        id: 'spark-1',
        pluginId: 'test-plugin',
        name: 'Test Spark',
        description: 'A test spark',
        schema: { type: 'object', properties: { value: { type: 'number' } } },
        extraField: 'should-not-appear',
      },
      {
        type: 'test:other',
        id: 'spark-2',
        pluginId: 'other-plugin',
        name: 'Other Spark',
        description: undefined,
        schema: null,
      },
    ]);

    const res = await app.get<
      Array<{
        type: string;
        id: string;
        pluginId: string;
        name: string;
        description?: string;
        schema: unknown;
      }>
    >('/api/sparks');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // Check first spark has all mapped fields
    expect(res.body[0].type).toBe('test:spark');
    expect(res.body[0].id).toBe('spark-1');
    expect(res.body[0].pluginId).toBe('test-plugin');
    expect(res.body[0].name).toBe('Test Spark');
    expect(res.body[0].description).toBe('A test spark');
    expect(res.body[0].schema).toEqual({
      type: 'object',
      properties: { value: { type: 'number' } },
    });

    // extraField should not be included in response
    expect((res.body[0] as Record<string, unknown>).extraField).toBeUndefined();

    // Check second spark
    expect(res.body[1].type).toBe('test:other');
    expect(res.body[1].id).toBe('spark-2');
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

  test('GET /api/sparks/:type returns spark details when found', async () => {
    mockRegistry.get.mockReturnValue({
      type: 'timer:tick',
      id: 'timer-spark',
      pluginId: 'timer-plugin',
      name: 'Timer Tick',
      description: 'Fires on a timer',
      schema: { type: 'object', properties: { interval: { type: 'number' } } },
      internalField: 'should-not-appear',
    });

    const res = await app.get<{
      type: string;
      id: string;
      pluginId: string;
      name: string;
      description: string;
      schema: unknown;
    }>('/api/sparks/timer:tick');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('timer:tick');
    expect(res.body.id).toBe('timer-spark');
    expect(res.body.pluginId).toBe('timer-plugin');
    expect(res.body.name).toBe('Timer Tick');
    expect(res.body.description).toBe('Fires on a timer');
    expect(res.body.schema).toEqual({
      type: 'object',
      properties: { interval: { type: 'number' } },
    });
    // Internal field should not be exposed
    expect((res.body as Record<string, unknown>).internalField).toBeUndefined();
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
