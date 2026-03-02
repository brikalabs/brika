/**
 * Tests for BoardService
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { BoardLoader } from '@/runtime/boards/board-loader';
import { BoardService } from '@/runtime/boards/board-service';
import type { Board, BoardBrickPlacement } from '@/runtime/boards/types';
import { BrickTypeRegistry } from '@/runtime/bricks';
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
  position: {
    x: 0,
    y: 0,
  },
  size: {
    w: 2,
    h: 2,
  },
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

describe('BoardService', () => {
  let service: BoardService;
  let boards: Map<string, Board>;
  let brickTypes: Map<string, RegisteredBrickType>;
  let mockProcess: Record<string, ReturnType<typeof mock>>;
  let mockDispatch: ReturnType<typeof mock>;
  let mockSave: ReturnType<typeof mock>;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);

      boards = new Map();
      brickTypes = new Map();

      mockProcess = {
        sendUpdateBrickConfig: mock(),
        sendBrickInstanceAction: mock(),
      };

      mockSave = mock().mockResolvedValue('/fake/path');
      mockDispatch = mock();

      stub(BoardLoader, {
        get: (id: string) => boards.get(id),
        list: () => [...boards.values()],
        saveBoard: mockSave,
      });

      stub(BrickTypeRegistry, {
        get: (id: string) => brickTypes.get(id),
      });

      stub(PluginLifecycle, {
        getProcess: () => mockProcess,
      });

      stub(EventSystem, {
        dispatch: mockDispatch,
      });

      service = get(BoardService);
    }
  );

  // ─── addBrick ────────────────────────────────────────────────────────

  describe('addBrick', () => {
    test('creates placement, saves, and returns it', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const board = createBoard('d1');
      boards.set('d1', board);

      const result = await service.addBrick('d1', 'plugin:brick', {
        key: 'val',
      } as Record<string, Json>);

      expect(result).not.toBeNull();
      expect(result?.brickTypeId).toBe('plugin:brick');
      expect(result?.config).toEqual({
        key: 'val',
      });
      expect(result?.instanceId).toMatch(/^inst-/);
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(board.bricks).toHaveLength(1);
    });

    test('dispatches brickAdded event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      boards.set('d1', createBoard('d1'));

      await service.addBrick('d1', 'plugin:brick', {});

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns null if board not found', async () => {
      const result = await service.addBrick('missing', 'plugin:brick', {});
      expect(result).toBeNull();
    });

    test('returns null if brick type not found', async () => {
      boards.set('d1', createBoard('d1'));
      const result = await service.addBrick('d1', 'missing:type', {});
      expect(result).toBeNull();
    });

    test('uses default size when not provided', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      boards.set('d1', createBoard('d1'));

      const result = await service.addBrick('d1', 'plugin:brick', {});

      expect(result?.size).toEqual({
        w: 2,
        h: 2,
      });
    });
  });

  // ─── removeBrick ─────────────────────────────────────────────────────

  describe('removeBrick', () => {
    test('removes placement, saves, returns true', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const board = createBoard('d1', [createPlacement('inst-1')]);
      boards.set('d1', board);

      const result = await service.removeBrick('d1', 'inst-1');

      expect(result).toBe(true);
      expect(board.bricks).toHaveLength(0);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('dispatches brickRemoved event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      boards.set('d1', createBoard('d1', [createPlacement('inst-1')]));

      await service.removeBrick('d1', 'inst-1');

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns false if board not found', async () => {
      expect(await service.removeBrick('missing', 'inst-1')).toBe(false);
    });

    test('returns false if instance not on board', async () => {
      boards.set('d1', createBoard('d1'));
      expect(await service.removeBrick('d1', 'missing')).toBe(false);
    });
  });

  // ─── updateBrickConfig ───────────────────────────────────────────────

  describe('updateBrickConfig', () => {
    test('updates config on placement and sends IPC', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const placement = createPlacement('inst-1');
      const board = createBoard('d1', [placement]);
      boards.set('d1', board);

      const newConfig = {
        unit: 'celsius',
      } as Record<string, Json>;
      const result = await service.updateBrickConfig('d1', 'inst-1', newConfig);

      expect(result).toBe(true);
      expect(placement.config).toEqual(newConfig);
      expect(mockProcess.sendUpdateBrickConfig).toHaveBeenCalledWith('inst-1', newConfig);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('dispatches brickConfigChanged event', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);
      boards.set('d1', createBoard('d1', [createPlacement('inst-1')]));

      await service.updateBrickConfig('d1', 'inst-1', {});

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns false if board not found', async () => {
      expect(await service.updateBrickConfig('missing', 'inst-1', {})).toBe(false);
    });

    test('returns false if instance not on board', async () => {
      boards.set('d1', createBoard('d1'));
      expect(await service.updateBrickConfig('d1', 'missing', {})).toBe(false);
    });
  });

  // ─── moveBrick ───────────────────────────────────────────────────────

  describe('moveBrick', () => {
    test('updates position and size', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const placement = createPlacement('inst-1');
      boards.set('d1', createBoard('d1', [placement]));

      const result = await service.moveBrick(
        'd1',
        'inst-1',
        {
          x: 3,
          y: 4,
        },
        {
          w: 4,
          h: 3,
        }
      );

      expect(result).toBe(true);
      expect(placement.position).toEqual({
        x: 3,
        y: 4,
      });
      expect(placement.size).toEqual({
        w: 4,
        h: 3,
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('returns false if board not found', async () => {
      expect(
        await service.moveBrick(
          'missing',
          'inst-1',
          {
            x: 0,
            y: 0,
          },
          {
            w: 2,
            h: 2,
          }
        )
      ).toBe(false);
    });

    test('returns false if instance not on board', async () => {
      boards.set('d1', createBoard('d1'));
      expect(
        await service.moveBrick(
          'd1',
          'missing',
          {
            x: 0,
            y: 0,
          },
          {
            w: 2,
            h: 2,
          }
        )
      ).toBe(false);
    });
  });

  // ─── batchUpdateLayout ───────────────────────────────────────────────

  describe('batchUpdateLayout', () => {
    test('updates multiple placements', async () => {
      const type = createBrickType();
      brickTypes.set(type.fullId, type);

      const p1 = createPlacement('inst-1');
      const p2 = createPlacement('inst-2');
      boards.set('d1', createBoard('d1', [p1, p2]));

      const result = await service.batchUpdateLayout('d1', [
        {
          instanceId: 'inst-1',
          x: 0,
          y: 0,
          w: 3,
          h: 3,
        },
        {
          instanceId: 'inst-2',
          x: 3,
          y: 0,
          w: 3,
          h: 3,
        },
      ]);

      expect(result).toBe(true);
      expect(p1.position).toEqual({
        x: 0,
        y: 0,
      });
      expect(p1.size).toEqual({
        w: 3,
        h: 3,
      });
      expect(p2.position).toEqual({
        x: 3,
        y: 0,
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    test('dispatches layoutChanged event', async () => {
      boards.set('d1', createBoard('d1'));

      await service.batchUpdateLayout('d1', []);

      expect(mockDispatch).toHaveBeenCalled();
    });

    test('returns false if board not found', async () => {
      expect(await service.batchUpdateLayout('missing', [])).toBe(false);
    });
  });

  // ─── viewerConnected / viewerDisconnected ─────────────────────────────

  describe('viewerConnected / viewerDisconnected', () => {
    test('tracks viewer count', () => {
      expect(service.hasActiveViewers('d1')).toBe(false);
      service.viewerConnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);
      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(false);
    });

    test('handles multiple viewers', () => {
      service.viewerConnected('d1');
      service.viewerConnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);
      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);
      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(false);
    });
  });
});
