/**
 * Tests for DashboardService
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import type { Json } from '@brika/shared';
import type { BrickInstance } from '@/runtime/bricks/brick-instance-manager';
import { BrickInstanceManager, BrickTypeRegistry } from '@/runtime/bricks';
import type { RegisteredBrickType } from '@/runtime/bricks/brick-type-registry';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { DashboardLoader } from '@/runtime/dashboards/dashboard-loader';
import { DashboardService } from '@/runtime/dashboards/dashboard-service';
import type { Dashboard, DashboardBrickPlacement } from '@/runtime/dashboards/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createDashboard = (id = 'dash-1', bricks: DashboardBrickPlacement[] = []): Dashboard => ({
  id,
  name: 'Test Dashboard',
  columns: 12,
  bricks,
});

const createPlacement = (
  instanceId = 'inst-1',
  brickTypeId = 'plugin:brick',
): DashboardBrickPlacement => ({
  instanceId,
  brickTypeId,
  config: {},
  position: { x: 0, y: 0 },
  size: { w: 2, h: 2 },
});

const createBrickType = (fullId = 'plugin:brick', pluginName = 'plugin'): RegisteredBrickType => ({
  fullId,
  localId: fullId.split(':')[1],
  pluginName,
  families: ['sm', 'md'],
});

// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let service: DashboardService;
  let dashboards: Map<string, Dashboard>;
  let brickTypes: Map<string, RegisteredBrickType>;
  let mountedInstances: Map<string, BrickInstance>;
  let mockProcess: Record<string, ReturnType<typeof mock>>;
  let mockDispatch: ReturnType<typeof mock>;
  let mockMount: ReturnType<typeof mock>;
  let mockUnmount: ReturnType<typeof mock>;
  let mockResize: ReturnType<typeof mock>;
  let mockSave: ReturnType<typeof mock>;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);

    dashboards = new Map();
    brickTypes = new Map();
    mountedInstances = new Map();

    mockProcess = {
      sendMountBrickInstance: mock(),
      sendUnmountBrickInstance: mock(),
      sendResizeBrickInstance: mock(),
      sendUpdateBrickConfig: mock(),
      sendBrickInstanceAction: mock(),
    };

    mockSave = mock().mockResolvedValue('/fake/path');
    mockDispatch = mock();
    mockMount = mock((id: string, typeId: string, plugin: string, w: number, h: number, config: Record<string, unknown>) => {
      mountedInstances.set(id, { instanceId: id, brickTypeId: typeId, pluginName: plugin, w, h, config, body: [] });
    });
    mockUnmount = mock((id: string) => mountedInstances.delete(id));
    mockResize = mock();

    stub(DashboardLoader, {
      get: (id: string) => dashboards.get(id),
      list: () => [...dashboards.values()],
      saveDashboard: mockSave,
    });

    stub(BrickTypeRegistry, {
      get: (id: string) => brickTypes.get(id),
    });

    stub(BrickInstanceManager, {
      mount: mockMount,
      unmount: mockUnmount,
      has: (id: string) => mountedInstances.has(id),
      get: (id: string) => mountedInstances.get(id),
      resize: mockResize,
    });

    stub(PluginLifecycle, {
      getProcess: () => mockProcess,
    });

    stub(EventSystem, {
      dispatch: mockDispatch,
    });

    service = get(DashboardService);
  });

  // ─── mountDashboard ──────────────────────────────────────────────────────

  describe('mountDashboard', () => {
    test('mounts all placements', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const dashboard = createDashboard('d1', [
        createPlacement('inst-1', 'plugin:brick'),
        createPlacement('inst-2', 'plugin:brick'),
      ]);

      service.mountDashboard(dashboard);

      expect(mockMount).toHaveBeenCalledTimes(2);
      expect(mockProcess.sendMountBrickInstance).toHaveBeenCalledTimes(2);
    });

    test('dispatches instanceMounted events', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const dashboard = createDashboard('d1', [createPlacement('inst-1')]);
      service.mountDashboard(dashboard);

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('skips already-mounted instances', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      // Pre-mount one instance
      mountedInstances.set('inst-1', {
        instanceId: 'inst-1', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });

      const dashboard = createDashboard('d1', [createPlacement('inst-1')]);
      service.mountDashboard(dashboard);

      expect(mockMount).not.toHaveBeenCalled();
    });

    test('skips placements with unknown brick type', () => {
      // No brick type registered
      const dashboard = createDashboard('d1', [createPlacement('inst-1')]);
      service.mountDashboard(dashboard);

      expect(mockMount).not.toHaveBeenCalled();
    });
  });

  // ─── unmountDashboard ────────────────────────────────────────────────────

  describe('unmountDashboard', () => {
    test('unmounts all placements and sends IPC', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const dashboard = createDashboard('d1', [
        createPlacement('inst-1'),
        createPlacement('inst-2'),
      ]);

      service.unmountDashboard(dashboard);

      expect(mockUnmount).toHaveBeenCalledTimes(2);
      expect(mockProcess.sendUnmountBrickInstance).toHaveBeenCalledTimes(2);
    });

    test('dispatches instanceUnmounted events', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const dashboard = createDashboard('d1', [createPlacement('inst-1')]);
      service.unmountDashboard(dashboard);

      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  // ─── addBrick ────────────────────────────────────────────────────────────

  describe('addBrick', () => {
    test('creates placement, saves, mounts, and returns it', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const dashboard = createDashboard('d1');
      dashboards.set('d1', dashboard);

      const result = await service.addBrick('d1', 'plugin:brick', { key: 'val' } as Record<string, Json>);

      expect(result).not.toBeNull();
      expect(result!.brickTypeId).toBe('plugin:brick');
      expect(result!.config).toEqual({ key: 'val' });
      expect(result!.instanceId).toMatch(/^inst-/);
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockMount).toHaveBeenCalledTimes(1);
      expect(dashboard.bricks).toHaveLength(1);
    });

    test('dispatches brickAdded event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      dashboards.set('d1', createDashboard('d1'));

      await service.addBrick('d1', 'plugin:brick', {});

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns null if dashboard not found', async () => {
      const result = await service.addBrick('missing', 'plugin:brick', {});
      expect(result).toBeNull();
    });

    test('returns null if brick type not found', async () => {
      dashboards.set('d1', createDashboard('d1'));
      const result = await service.addBrick('d1', 'missing:type', {});
      expect(result).toBeNull();
    });

    test('uses default size when not provided', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      dashboards.set('d1', createDashboard('d1'));

      const result = await service.addBrick('d1', 'plugin:brick', {});

      expect(result!.size).toEqual({ w: 2, h: 2 });
    });
  });

  // ─── removeBrick ─────────────────────────────────────────────────────────

  describe('removeBrick', () => {
    test('removes placement, saves, unmounts, returns true', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const dashboard = createDashboard('d1', [createPlacement('inst-1')]);
      dashboards.set('d1', dashboard);

      const result = await service.removeBrick('d1', 'inst-1');

      expect(result).toBe(true);
      expect(dashboard.bricks).toHaveLength(0);
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockUnmount).toHaveBeenCalledTimes(1);
    });

    test('dispatches brickRemoved event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      dashboards.set('d1', createDashboard('d1', [createPlacement('inst-1')]));

      await service.removeBrick('d1', 'inst-1');

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns false if dashboard not found', async () => {
      expect(await service.removeBrick('missing', 'inst-1')).toBe(false);
    });

    test('returns false if instance not on dashboard', async () => {
      dashboards.set('d1', createDashboard('d1'));
      expect(await service.removeBrick('d1', 'missing')).toBe(false);
    });
  });

  // ─── updateBrickConfig ───────────────────────────────────────────────────

  describe('updateBrickConfig', () => {
    test('updates config on placement, instance, and IPC', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const placement = createPlacement('inst-1');
      const dashboard = createDashboard('d1', [placement]);
      dashboards.set('d1', dashboard);

      // Pre-mount instance
      mountedInstances.set('inst-1', {
        instanceId: 'inst-1', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });

      const newConfig = { unit: 'celsius' } as Record<string, Json>;
      const result = await service.updateBrickConfig('d1', 'inst-1', newConfig);

      expect(result).toBe(true);
      expect(placement.config).toEqual(newConfig);
      expect(mockProcess.sendUpdateBrickConfig).toHaveBeenCalledWith('inst-1', newConfig);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('dispatches brickConfigChanged event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      dashboards.set('d1', createDashboard('d1', [createPlacement('inst-1')]));

      await service.updateBrickConfig('d1', 'inst-1', {});

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns false if dashboard not found', async () => {
      expect(await service.updateBrickConfig('missing', 'inst-1', {})).toBe(false);
    });

    test('returns false if instance not on dashboard', async () => {
      dashboards.set('d1', createDashboard('d1'));
      expect(await service.updateBrickConfig('d1', 'missing', {})).toBe(false);
    });
  });

  // ─── moveBrick ───────────────────────────────────────────────────────────

  describe('moveBrick', () => {
    test('updates position and size', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const placement = createPlacement('inst-1');
      dashboards.set('d1', createDashboard('d1', [placement]));
      mountedInstances.set('inst-1', {
        instanceId: 'inst-1', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });

      const result = await service.moveBrick('d1', 'inst-1', { x: 3, y: 4 }, { w: 4, h: 3 });

      expect(result).toBe(true);
      expect(placement.position).toEqual({ x: 3, y: 4 });
      expect(placement.size).toEqual({ w: 4, h: 3 });
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('sends resize IPC only when size changed', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const placement = createPlacement('inst-1');
      dashboards.set('d1', createDashboard('d1', [placement]));
      mountedInstances.set('inst-1', {
        instanceId: 'inst-1', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });

      // Same size, different position — no resize IPC
      await service.moveBrick('d1', 'inst-1', { x: 5, y: 5 }, { w: 2, h: 2 });
      expect(mockResize).not.toHaveBeenCalled();
      expect(mockProcess.sendResizeBrickInstance).not.toHaveBeenCalled();

      // Different size — resize IPC sent
      await service.moveBrick('d1', 'inst-1', { x: 5, y: 5 }, { w: 4, h: 3 });
      expect(mockResize).toHaveBeenCalled();
      expect(mockProcess.sendResizeBrickInstance).toHaveBeenCalled();
    });

    test('returns false if dashboard not found', async () => {
      expect(await service.moveBrick('missing', 'inst-1', { x: 0, y: 0 }, { w: 2, h: 2 })).toBe(false);
    });

    test('returns false if instance not on dashboard', async () => {
      dashboards.set('d1', createDashboard('d1'));
      expect(await service.moveBrick('d1', 'missing', { x: 0, y: 0 }, { w: 2, h: 2 })).toBe(false);
    });
  });

  // ─── batchUpdateLayout ───────────────────────────────────────────────────

  describe('batchUpdateLayout', () => {
    test('updates multiple placements', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const p1 = createPlacement('inst-1');
      const p2 = createPlacement('inst-2');
      dashboards.set('d1', createDashboard('d1', [p1, p2]));

      const result = await service.batchUpdateLayout('d1', [
        { instanceId: 'inst-1', x: 0, y: 0, w: 3, h: 3 },
        { instanceId: 'inst-2', x: 3, y: 0, w: 3, h: 3 },
      ]);

      expect(result).toBe(true);
      expect(p1.position).toEqual({ x: 0, y: 0 });
      expect(p1.size).toEqual({ w: 3, h: 3 });
      expect(p2.position).toEqual({ x: 3, y: 0 });
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('sends resize IPC only for bricks whose size changed', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const p1 = createPlacement('inst-1'); // size 2x2
      const p2 = createPlacement('inst-2'); // size 2x2
      dashboards.set('d1', createDashboard('d1', [p1, p2]));
      mountedInstances.set('inst-1', {
        instanceId: 'inst-1', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });
      mountedInstances.set('inst-2', {
        instanceId: 'inst-2', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });

      await service.batchUpdateLayout('d1', [
        { instanceId: 'inst-1', x: 0, y: 0, w: 2, h: 2 }, // same size
        { instanceId: 'inst-2', x: 3, y: 0, w: 4, h: 4 }, // size changed
      ]);

      // Only inst-2 should trigger resize
      expect(mockResize).toHaveBeenCalledTimes(1);
      expect(mockProcess.sendResizeBrickInstance).toHaveBeenCalledTimes(1);
    });

    test('dispatches layoutChanged event', async () => {
      dashboards.set('d1', createDashboard('d1'));

      await service.batchUpdateLayout('d1', []);

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns false if dashboard not found', async () => {
      expect(await service.batchUpdateLayout('missing', [])).toBe(false);
    });
  });

  // ─── mountPendingForType ─────────────────────────────────────────────────

  describe('mountPendingForType', () => {
    test('mounts unmounted placements matching the type', () => {
      const type = createBrickType('plugin:brick', 'plugin');
      brickTypes.set(type.fullId, type);

      dashboards.set('d1', createDashboard('d1', [
        createPlacement('inst-1', 'plugin:brick'),
        createPlacement('inst-2', 'plugin:other'), // different type
      ]));

      service.mountPendingForType('plugin:brick');

      // Only inst-1 matches and is unmounted
      expect(mockMount).toHaveBeenCalledTimes(1);
    });

    test('skips already-mounted instances', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      mountedInstances.set('inst-1', {
        instanceId: 'inst-1', brickTypeId: 'plugin:brick',
        pluginName: 'plugin', w: 2, h: 2, config: {}, body: [],
      });

      dashboards.set('d1', createDashboard('d1', [createPlacement('inst-1')]));

      service.mountPendingForType('plugin:brick');

      expect(mockMount).not.toHaveBeenCalled();
    });
  });
});
