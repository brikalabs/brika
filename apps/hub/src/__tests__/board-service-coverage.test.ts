/**
 * Supplementary coverage tests for BoardService
 *
 * Targets uncovered lines not exercised by the main test suite:
 *   - Lines 46-52: viewerDisconnected() — both decrement-only and unmount branches
 *   - Lines 186-207: updateBrickLabel() — label update, save, and event dispatch
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { BoardLoader } from '@/runtime/boards/board-loader';
import { BoardService } from '@/runtime/boards/board-service';
import type { Board, BoardBrickPlacement } from '@/runtime/boards/types';
import { BrickInstanceManager, BrickTypeRegistry } from '@/runtime/bricks';
import type { BrickInstance } from '@/runtime/bricks/brick-instance-manager';
import type { RegisteredBrickType } from '@/runtime/bricks/brick-type-registry';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { Json } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createBoard = (id = 'dash-1', bricks: BoardBrickPlacement[] = []): Board => ({
  id,
  name: 'Test Board',
  columns: 12,
  bricks,
});

const createPlacement = (
  instanceId = 'inst-1',
  brickTypeId = 'plugin:brick'
): BoardBrickPlacement => ({
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

describe('BoardService — coverage gaps', () => {
  let service: BoardService;
  let boards: Map<string, Board>;
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

    boards = new Map();
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
    mockMount = mock(
      (
        id: string,
        typeId: string,
        plugin: string,
        w: number,
        h: number,
        config: Record<string, unknown>
      ) => {
        mountedInstances.set(id, {
          instanceId: id,
          brickTypeId: typeId,
          pluginName: plugin,
          w,
          h,
          config,
          body: [],
        });
      }
    );
    mockUnmount = mock((id: string) => mountedInstances.delete(id));
    mockResize = mock();

    stub(BoardLoader, {
      get: (id: string) => boards.get(id),
      list: () => [...boards.values()],
      saveBoard: mockSave,
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

    service = get(BoardService);
  });

  // ─── viewerDisconnected (lines 46-55) ─────────────────────────────────

  describe('viewerDisconnected', () => {
    test('unmounts board when last viewer disconnects', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const board = createBoard('d1', [createPlacement('inst-1')]);
      boards.set('d1', board);

      // Connect a single viewer — this mounts the board
      service.viewerConnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);
      expect(mockMount).toHaveBeenCalledTimes(1);

      // Disconnect the only viewer — should unmount the board
      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(false);
      expect(mockUnmount).toHaveBeenCalledTimes(1);
    });

    test('decrements viewer count without unmounting when viewers remain', () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const board = createBoard('d1', [createPlacement('inst-1')]);
      boards.set('d1', board);

      // Connect two viewers
      service.viewerConnected('d1');
      service.viewerConnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);
      mockMount.mockClear();
      mockUnmount.mockClear();

      // Disconnect one viewer — should NOT unmount
      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);
      expect(mockUnmount).not.toHaveBeenCalled();

      // Disconnect the last viewer — should unmount
      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(false);
      expect(mockUnmount).toHaveBeenCalledTimes(1);
    });

    test('handles disconnect for board with no brick types (no unmountBoard IPC)', () => {
      // Board has a placement but no registered brick type
      const board = createBoard('d1', [createPlacement('inst-1')]);
      boards.set('d1', board);

      // Connect and disconnect — viewerConnected won't mount (no type),
      // but viewerDisconnected should still run the unmount path
      service.viewerConnected('d1');
      service.viewerDisconnected('d1');

      expect(service.hasActiveViewers('d1')).toBe(false);
    });

    test('handles disconnect for a board that is not loaded', () => {
      // No board in the loader map — viewerDisconnected still cleans up viewer count
      service.viewerConnected('missing');
      service.viewerDisconnected('missing');

      expect(service.hasActiveViewers('missing')).toBe(false);
    });
  });

  // ─── updateBrickLabel (lines 186-207) ──────────────────────────────────

  describe('updateBrickLabel', () => {
    test('sets label on placement, saves board, and dispatches event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const placement = createPlacement('inst-1');
      const board = createBoard('d1', [placement]);
      boards.set('d1', board);

      const result = await service.updateBrickLabel('d1', 'inst-1', 'My Custom Label');

      expect(result).toBe(true);
      expect(placement.label).toBe('My Custom Label');
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalled();
    });

    test('clears label when set to undefined', async () => {
      const placement = createPlacement('inst-1');
      placement.label = 'Old Label';
      const board = createBoard('d1', [placement]);
      boards.set('d1', board);

      const result = await service.updateBrickLabel('d1', 'inst-1', undefined);

      expect(result).toBe(true);
      expect(placement.label).toBeUndefined();
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('returns false if board not found', async () => {
      const result = await service.updateBrickLabel('missing', 'inst-1', 'Label');
      expect(result).toBe(false);
    });

    test('returns false if instance not on board', async () => {
      boards.set('d1', createBoard('d1'));
      const result = await service.updateBrickLabel('d1', 'missing', 'Label');
      expect(result).toBe(false);
    });

    test('dispatches brickLabelChanged event with correct payload', async () => {
      const placement = createPlacement('inst-1');
      const board = createBoard('d1', [placement]);
      boards.set('d1', board);

      await service.updateBrickLabel('d1', 'inst-1', 'Weather');

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      const dispatchedAction = mockDispatch.mock.calls[0][0];
      expect(dispatchedAction.type).toBe('board.brickLabelChanged');
      expect(dispatchedAction.payload).toEqual({
        boardId: 'd1',
        instanceId: 'inst-1',
        label: 'Weather',
      });
    });
  });
});
