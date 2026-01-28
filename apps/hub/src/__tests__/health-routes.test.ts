import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { healthRoutes } from '@/runtime/http/routes/health';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { SparkRegistry } from '@/runtime/sparks/spark-registry';
import { WorkflowEngine } from '@/runtime/workflows';

const di = useTestBed();

describe('health routes', () => {
  let app: ReturnType<typeof TestApp.create>;

  beforeEach(() => {
    di.stub(PluginManager);
    di.stub(BlockRegistry);
    di.stub(WorkflowEngine);
    di.stub(SparkRegistry);
    app = TestApp.create(healthRoutes);
  });

  test('GET /api/health returns ok status', async () => {
    const res = await app.get<{ ok: boolean; version: string }>('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(res.body.version).toBeDefined();
  });

  test('GET /api/stats returns stats object', async () => {
    const res = await app.get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('plugins');
    expect(res.body).toHaveProperty('blocks');
    expect(res.body).toHaveProperty('workflows');
    expect(res.body).toHaveProperty('sparks');
  });
});
