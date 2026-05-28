/**
 * Supplementary coverage tests for BoardService
 *
 * Targets uncovered lines not exercised by the main test suite:
 *   - viewerDisconnected() — both decrement-only and cleanup branches
 *   - updateBrickLabel() — label update, save, and event dispatch
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

describe('BoardService — coverage gaps', () => {
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

  // ─── viewerDisconnected ─────────────────────────────────────────────

  describe('viewerDisconnected', () => {
    test('cleans up when last viewer disconnects', () => {
      service.viewerConnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);

      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(false);
    });

    test('decrements viewer count without cleanup when viewers remain', () => {
      service.viewerConnected('d1');
      service.viewerConnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);

      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(true);

      service.viewerDisconnected('d1');
      expect(service.hasActiveViewers('d1')).toBe(false);
    });

    test('handles disconnect for a board that is not loaded', () => {
      service.viewerConnected('missing');
      service.viewerDisconnected('missing');

      expect(service.hasActiveViewers('missing')).toBe(false);
    });
  });

  // ─── updateBrickLabel ──────────────────────────────────────────────

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
