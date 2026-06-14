import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { BlockRegistry } from '@/runtime/blocks';
import type { RegisteredBlock } from '@/runtime/blocks/block-registry';
import { blocksRoutes } from '@/runtime/http/routes/blocks';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

const SPARK_RECEIVER: RegisteredBlock = {
  id: 'spark-receiver',
  type: '@brika/plugin-builtin:spark-receiver',
  pluginId: '@brika/plugin-builtin',
  name: 'Spark Receiver',
  category: 'trigger',
  inputs: [],
  outputs: [{ id: 'out', name: 'Payload', direction: 'output', type: { kind: 'unknown' } }],
  schema: { type: 'object', properties: {} },
};

const PLAIN_BLOCK: RegisteredBlock = {
  id: 'log',
  type: '@brika/plugin-builtin:log',
  pluginId: '@brika/plugin-builtin',
  name: 'Log',
  category: 'action',
  inputs: [{ id: 'in', name: 'In', direction: 'input', type: { kind: 'unknown' } }],
  outputs: [],
  schema: { type: 'object', properties: {} },
};

describe('block routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockRegistry: { list: ReturnType<typeof mock>; listByCategory: ReturnType<typeof mock> };
  let mockLifecycle: { getProcess: ReturnType<typeof mock> };
  let mockCompiler: { get: ReturnType<typeof mock> };

  useTestBed(() => {
    mockRegistry = {
      list: mock().mockReturnValue([SPARK_RECEIVER, PLAIN_BLOCK]),
      listByCategory: mock().mockReturnValue({}),
    };
    mockLifecycle = {
      getProcess: mock().mockReturnValue({ uid: 'plg-1' }),
    };
    // Only the spark-receiver ships a compiled view module.
    mockCompiler = {
      get: mock().mockImplementation((key: string) =>
        key === '@brika/plugin-builtin:blocks/spark-receiver.view'
          ? { hash: 'abc123', filePath: '/tmp/x.js' }
          : undefined
      ),
    };
    stub(BlockRegistry, mockRegistry);
    stub(PluginLifecycle, mockLifecycle);
    stub(ModuleCompiler, mockCompiler);
    app = TestApp.create(blocksRoutes);
  });

  test('attaches viewModuleUrl + pluginUid to blocks that ship a custom view', async () => {
    const res =
      await app.get<Array<{ id: string; viewModuleUrl?: string; pluginUid?: string }>>(
        '/api/blocks'
      );

    expect(res.status).toBe(200);
    const sparkReceiver = res.body.find((b) => b.id === 'spark-receiver');
    expect(sparkReceiver?.viewModuleUrl).toBe(
      '/api/modules/plg-1/blockView/spark-receiver.abc123.js'
    );
    expect(sparkReceiver?.pluginUid).toBe('plg-1');
  });

  test('leaves blocks without a view module untouched', async () => {
    const res =
      await app.get<Array<{ id: string; viewModuleUrl?: string; pluginUid?: string }>>(
        '/api/blocks'
      );

    const log = res.body.find((b) => b.id === 'log');
    expect(log?.viewModuleUrl).toBeUndefined();
    expect(log?.pluginUid).toBeUndefined();
  });

  test('omits the view URL when the owning plugin is not running', async () => {
    mockLifecycle.getProcess.mockReturnValue(undefined);

    const res = await app.get<Array<{ id: string; viewModuleUrl?: string }>>('/api/blocks');

    expect(res.body.find((b) => b.id === 'spark-receiver')?.viewModuleUrl).toBeUndefined();
  });
});
