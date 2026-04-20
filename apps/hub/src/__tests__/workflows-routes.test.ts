/**
 * Tests for workflow HTTP routes
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { workflowsRoutes } from '@/runtime/http/routes/workflows';
import { WorkflowEngine, WorkflowLoader } from '@/runtime/workflows';

describe('workflows routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockEngine: {
    list: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    getBlockTypes: ReturnType<typeof mock>;
    setEnabled: ReturnType<typeof mock>;
    addGlobalListener: ReturnType<typeof mock>;
  };
  let mockLoader: {
    saveWorkflow: ReturnType<typeof mock>;
    deleteWorkflow: ReturnType<typeof mock>;
  };
  let mockBlockRegistry: {
    validateConnections: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockEngine = {
      list: mock().mockReturnValue([]),
      get: mock().mockReturnValue(undefined),
      getBlockTypes: mock().mockReturnValue([]),
      setEnabled: mock().mockReturnValue(true),
      addGlobalListener: mock().mockReturnValue(() => undefined),
    };
    mockLoader = {
      saveWorkflow: mock().mockResolvedValue('/path/to/workflow.yaml'),
      deleteWorkflow: mock().mockResolvedValue(true),
    };
    mockBlockRegistry = {
      validateConnections: mock().mockReturnValue({
        valid: true,
      }),
    };
    stub(WorkflowEngine, mockEngine);
    stub(WorkflowLoader, mockLoader);
    stub(BlockRegistry, mockBlockRegistry);
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

  test('GET /api/workflows/:id returns 200 when workflow found', async () => {
    const workflow = {
      id: 'test-wf',
      name: 'Test Workflow',
      enabled: true,
      blocks: [],
      connections: [],
    };
    mockEngine.get.mockReturnValue(workflow);

    const res = await app.get('/api/workflows/test-wf');

    expect(res.status).toBe(200);
  });

  test('POST /api/workflows creates workflow', async () => {
    const res = await app.post<{
      ok: boolean;
      id: string;
    }>('/api/workflows', {
      id: 'test-workflow',
      name: 'Test Workflow',
      blocks: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(res.body.id).toBe('test-workflow');
    expect(mockLoader.saveWorkflow).toHaveBeenCalled();
  });

  test('POST /api/workflows creates workflow with connections', async () => {
    const res = await app.post<{
      ok: boolean;
      id: string;
    }>('/api/workflows', {
      id: 'connected-workflow',
      name: 'Connected Workflow',
      blocks: [
        {
          id: 'block-a',
          type: 'timer',
        },
        {
          id: 'block-b',
          type: 'logger',
        },
      ],
      connections: [
        {
          from: 'block-a',
          fromPort: 'tick',
          to: 'block-b',
          toPort: 'input',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
  });

  test('POST /api/workflows returns 400 for invalid connections', async () => {
    mockBlockRegistry.validateConnections.mockReturnValue({
      valid: false,
      errors: ['Incompatible types'],
    });

    const res = await app.post('/api/workflows', {
      id: 'bad-workflow',
      name: 'Bad Workflow',
      blocks: [
        {
          id: 'block-a',
          type: 'timer',
        },
        {
          id: 'block-b',
          type: 'logger',
        },
      ],
      connections: [
        {
          from: 'block-a',
          fromPort: 'tick',
          to: 'block-b',
          toPort: 'input',
        },
      ],
    });

    expect(res.status).toBe(400);
  });

  test('POST /api/workflows with enabled flag', async () => {
    const res = await app.post<{
      ok: boolean;
      id: string;
    }>('/api/workflows', {
      id: 'enabled-workflow',
      name: 'Enabled Workflow',
      blocks: [],
      enabled: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    // Verify the workflow was saved with enabled flag
    const savedWorkflow =
      mockLoader.saveWorkflow.mock.calls[mockLoader.saveWorkflow.mock.calls.length - 1][0];
    expect(savedWorkflow.enabled).toBe(true);
  });

  test('POST /api/workflows defaults enabled to false', async () => {
    const res = await app.post<{
      ok: boolean;
      id: string;
    }>('/api/workflows', {
      id: 'default-workflow',
      name: 'Default Workflow',
      blocks: [],
    });

    expect(res.status).toBe(200);
    const savedWorkflow =
      mockLoader.saveWorkflow.mock.calls[mockLoader.saveWorkflow.mock.calls.length - 1][0];
    expect(savedWorkflow.enabled).toBe(false);
  });

  test('POST /api/workflows/enable enables a workflow', async () => {
    const res = await app.post<{
      ok: boolean;
    }>('/api/workflows/enable', {
      id: 'test-id',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(mockEngine.setEnabled).toHaveBeenCalledWith('test-id', true);
  });

  test('POST /api/workflows/disable disables a workflow', async () => {
    const res = await app.post<{
      ok: boolean;
    }>('/api/workflows/disable', {
      id: 'test-id',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(mockEngine.setEnabled).toHaveBeenCalledWith('test-id', false);
  });

  test('DELETE /api/workflows/:id deletes workflow', async () => {
    const res = await app.delete<{
      ok: boolean;
    }>('/api/workflows/test-id');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(mockLoader.deleteWorkflow).toHaveBeenCalledWith('test-id');
  });

  test('DELETE /api/workflows/:id returns false when workflow not found', async () => {
    mockLoader.deleteWorkflow.mockResolvedValue(false);

    const res = await app.delete<{
      ok: boolean;
    }>('/api/workflows/missing');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeFalse();
  });

  test('GET /api/workflows/debug returns SSE stream with init event', async () => {
    mockEngine.list.mockReturnValue([
      {
        id: 'wf-1',
        enabled: true,
        startedAt: 1000,
      },
      {
        id: 'wf-2',
        enabled: false,
        startedAt: undefined,
      },
    ]);

    // Use hono.fetch directly to avoid TestApp body parsing (which hangs on SSE)
    const raw = await app.hono.fetch(new Request('http://test/api/workflows/debug'));

    expect(raw.status).toBe(200);
    expect(raw.headers.get('Content-Type')).toBe('text/event-stream');

    // Read just the first chunk from the SSE stream, then cancel
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('Expected readable stream reader');
    }
    const { value } = await reader.read();
    await reader.cancel();

    const text = new TextDecoder().decode(value);

    // Should contain init event with running workflows
    expect(text).toContain('event: debug');
    expect(text).toContain('"type":"init"');
    // Only enabled+startedAt workflows are included in runningWorkflows
    expect(text).toContain('"runningWorkflows"');
    expect(text).toContain('"wf-1"');
    // wf-2 is not running (no startedAt or not enabled)
    expect(text).not.toContain('"wf-2"');
  });

  test('GET /api/workflows/debug subscribes to global workflow events', async () => {
    mockEngine.list.mockReturnValue([]);

    let _capturedListener: ((event: unknown) => void) | undefined;
    mockEngine.addGlobalListener.mockImplementation((listener: (event: unknown) => void) => {
      _capturedListener = listener;
      return () => {
        _capturedListener = undefined;
      };
    });

    const raw = await app.hono.fetch(new Request('http://test/api/workflows/debug'));

    expect(raw.status).toBe(200);
    expect(mockEngine.addGlobalListener).toHaveBeenCalled();

    // Cancel the stream to prevent hanging
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('Expected readable stream reader');
    }
    await reader.cancel();
  });

  test('GET /api/workflows/debug with no running workflows sends empty array', async () => {
    mockEngine.list.mockReturnValue([]);

    const raw = await app.hono.fetch(new Request('http://test/api/workflows/debug'));

    // Read just the first chunk from the SSE stream, then cancel
    const reader = raw.body?.getReader();
    if (!reader) {
      throw new Error('Expected readable stream reader');
    }
    const { value } = await reader.read();
    await reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain('"runningWorkflows":[]');
  });
});
