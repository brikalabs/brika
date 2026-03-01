/**
 * Tests for WorkflowsLoader
 * Testing workflow loading and watching
 */
import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { WorkflowsLoader } from '@/runtime/bootstrap/workflows-loader';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { WorkflowEngine, WorkflowLoader } from '@/runtime/workflows';

useTestBed({
  autoStub: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createMockConfig = (): BrikaConfig => ({
  hub: {
    host: '0.0.0.0',
    port: 3001,
    plugins: {
      installDir: '/tmp',
      heartbeatInterval: 5000,
      heartbeatTimeout: 15000,
    },
  },
  plugins: [],
  rules: [],
  schedules: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('WorkflowsLoader', () => {
  let loader: WorkflowsLoader;
  let engineInitMock: ReturnType<typeof mock>;
  let engineStopMock: ReturnType<typeof mock>;
  let loadDirMock: ReturnType<typeof mock>;
  let watchMock: ReturnType<typeof mock>;
  let stopWatchingMock: ReturnType<typeof mock>;
  let getBrikaDirMock: ReturnType<typeof mock>;

  beforeEach(() => {
    engineInitMock = mock().mockResolvedValue(undefined);
    engineStopMock = mock().mockResolvedValue(undefined);
    loadDirMock = mock().mockResolvedValue(undefined);
    watchMock = mock();
    stopWatchingMock = mock();
    getBrikaDirMock = mock().mockReturnValue('/home/user/.brika');

    stub(WorkflowEngine, {
      init: engineInitMock,
      stop: engineStopMock,
    });
    stub(WorkflowLoader, {
      loadDir: loadDirMock,
      watch: watchMock,
      stopWatching: stopWatchingMock,
    });
    stub(ConfigLoader, {
      getBrikaDir: getBrikaDirMock,
    });

    loader = get(WorkflowsLoader);
  });

  test('has correct name', () => {
    expect(loader.name).toBe('workflows');
  });

  describe('init', () => {
    test('initializes workflow engine', async () => {
      await loader.init();
      expect(engineInitMock).toHaveBeenCalled();
    });
  });

  describe('load', () => {
    test('loads workflows from brika directory', async () => {
      const config = createMockConfig();

      await loader.load(config);

      expect(loadDirMock).toHaveBeenCalledWith('/home/user/.brika/workflows');
    });

    test('starts watching for changes', async () => {
      const config = createMockConfig();

      await loader.load(config);

      expect(watchMock).toHaveBeenCalled();
    });

    test('loads before watching', async () => {
      const callOrder: string[] = [];

      loadDirMock.mockImplementation(() => {
        callOrder.push('loadDir');
        return Promise.resolve();
      });
      watchMock.mockImplementation(() => {
        callOrder.push('watch');
      });

      await loader.load(createMockConfig());

      expect(callOrder).toEqual(['loadDir', 'watch']);
    });

    test('uses correct workflows path from config loader', async () => {
      getBrikaDirMock.mockReturnValue('/custom/path/.brika');

      await loader.load(createMockConfig());

      expect(loadDirMock).toHaveBeenCalledWith('/custom/path/.brika/workflows');
    });
  });

  describe('stop', () => {
    test('stops watching for changes', async () => {
      await loader.stop();
      expect(stopWatchingMock).toHaveBeenCalled();
    });

    test('stops workflow engine', async () => {
      await loader.stop();
      expect(engineStopMock).toHaveBeenCalled();
    });

    test('stops watching before stopping engine', async () => {
      const callOrder: string[] = [];

      stopWatchingMock.mockImplementation(() => {
        callOrder.push('stopWatching');
      });
      engineStopMock.mockImplementation(() => {
        callOrder.push('engineStop');
        return Promise.resolve();
      });

      await loader.stop();

      expect(callOrder).toEqual(['stopWatching', 'engineStop']);
    });
  });
});
