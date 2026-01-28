import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { workflowsRoutes } from '@/runtime/http/routes/workflows';
import { WorkflowEngine, WorkflowLoader } from '@/runtime/workflows';

const di = useTestBed();

describe('workflows routes', () => {
  let app: ReturnType<typeof TestApp.create>;

  beforeEach(() => {
    di.stub(WorkflowEngine, {
      list: () => [],
      get: () => undefined,
      getBlockTypes: () => [],
      setEnabled: () => Promise.resolve(true),
    });
    di.stub(WorkflowLoader, {
      saveWorkflow: () => Promise.resolve(),
      deleteWorkflow: () => Promise.resolve(true),
    });
    di.stub(BlockRegistry, { validateConnections: () => ({ valid: true }) });
    app = TestApp.create(workflowsRoutes);
  });

  test('GET /api/workflows returns list', async () => {
    const res = await app.get('/api/workflows');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTrue();
  });

  test('GET /api/workflows/blocks returns block types', async () => {
    const res = await app.get('/api/workflows/blocks');

    expect(res.status).toBe(200);
  });

  test('GET /api/workflows/:id returns 404 for unknown workflow', async () => {
    const res = await app.get('/api/workflows/unknown-id');

    expect(res.status).toBe(404);
  });

  test('POST /api/workflows creates workflow', async () => {
    const res = await app.post<{ ok: boolean; id: string }>('/api/workflows', {
      id: 'test-workflow',
      name: 'Test Workflow',
      blocks: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(res.body.id).toBe('test-workflow');
  });

  test('DELETE /api/workflows/:id deletes workflow', async () => {
    const res = await app.delete<{ ok: boolean }>('/api/workflows/test-id');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
  });
});
