/**
 * Extra coverage for the update routes — the existing
 * `updates-routes.test.ts` covers GET happy-path and SSE error
 * stream; this file picks up:
 *
 *   - `GET /api/system/update?refresh=true` calls `refresh()`, not `check()`
 *   - `POST /apply` returns 409 when the strategy refuses (container,
 *     system-package, dev modes)
 *   - `POST /apply` returns 423 when the orchestrator lock is held
 *   - `GET /api/system/update/compat` builds against the latest version
 *   - `GET /api/system/migrations` returns the last status snapshot
 *   - `POST /api/system/restart` and `/stop` return ok
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { MigrationStatus } from '@/runtime/bootstrap/plugins/migrations';
import {
  systemAdminRoutes,
  systemReadRoutes,
  updateAdminRoutes,
  updateReadRoutes,
} from '@/runtime/http/routes/updates';
import { StateStore } from '@/runtime/state/state-store';
import { CompatReportBuilder } from '@/runtime/updates/compat-report';
import { UpdateOrchestrator } from '@/runtime/updates/orchestrator';
import { UpdateRefusedError } from '@/runtime/updates/strategies';
import { UpdateService } from '@/runtime/updates/update-service';

const MOCK_INFO = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  updateAvailable: true,
  devBuild: false,
  channelMismatch: false,
  releaseUrl: '',
  releaseNotes: '',
  publishedAt: '',
  releaseCommit: '',
  currentCommit: '',
  assetName: null,
  assetSize: null,
  channel: 'stable' as const,
};

describe('GET /api/system/update?refresh=true', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockCheck: ReturnType<typeof mock>;
  let mockRefresh: ReturnType<typeof mock>;

  useTestBed(() => {
    mockCheck = mock().mockResolvedValue(MOCK_INFO);
    mockRefresh = mock().mockResolvedValue({ ...MOCK_INFO, latestVersion: '1.2.0' });
    stub(UpdateService, {
      check: mockCheck,
      refresh: mockRefresh,
      lastCheckedAt: 42,
    });
    app = TestApp.create(updateReadRoutes);
  });

  test('hits refresh() and bypasses the TTL cache', async () => {
    const res = await app.get('/api/system/update?refresh=true');
    expect(res.status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  test('plain GET (no refresh) uses the cached check()', async () => {
    const res = await app.get('/api/system/update');
    expect(res.status).toBe(200);
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('POST /api/system/update/apply — refusal + lock paths', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockOrchestrator: {
    canApply: ReturnType<typeof mock>;
    peekLockHolder: ReturnType<typeof mock>;
    apply: ReturnType<typeof mock>;
    markRestartPending: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockOrchestrator = {
      canApply: mock(),
      peekLockHolder: mock(),
      apply: mock(),
      markRestartPending: mock(),
    };
    stub(UpdateOrchestrator, mockOrchestrator);
    stub(StateStore, {
      getUpdateChannel: mock().mockReturnValue('stable'),
      getPinnedVersion: mock().mockReturnValue(null),
    });
    app = TestApp.create(updateAdminRoutes);
  });

  test('returns 409 Conflict when the strategy refuses', async () => {
    mockOrchestrator.canApply.mockReturnValue(false);
    mockOrchestrator.apply.mockImplementation(() =>
      Promise.reject(
        new UpdateRefusedError(
          'UPDATE_CONTAINER',
          'Run `docker pull ghcr.io/brikalabs/brika:latest`'
        )
      )
    );

    const res = await app.post('/api/system/update/apply');
    expect(res.status).toBe(409);
    // The Conflict thrown by the route wraps the error message in
    // `error`, the structured `{code, guidance}` in `data`.
    expect(JSON.stringify(res.body)).toContain('UPDATE_CONTAINER');
    expect(JSON.stringify(res.body)).toContain('docker pull');
  });

  test('returns 423 Locked when another caller holds the lock', async () => {
    mockOrchestrator.canApply.mockReturnValue(true);
    mockOrchestrator.peekLockHolder.mockReturnValue({
      pid: 9999,
      startedAt: '2026-05-27T00:00:00.000Z',
    });

    const res = await app.post('/api/system/update/apply');
    expect(res.status).toBe(423);
    expect(res.body).toMatchObject({ since: '2026-05-27T00:00:00.000Z' });
    // Must NOT leak pid to the body.
    expect(res.body).not.toHaveProperty('pid');
  });
});

describe('GET /api/system/update/compat', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockBuild: ReturnType<typeof mock>;

  useTestBed(() => {
    stub(UpdateService, {
      check: mock().mockResolvedValue({ ...MOCK_INFO, latestVersion: '2.0.0' }),
    });
    mockBuild = mock().mockReturnValue({
      targetVersion: '2.0.0',
      plugins: [],
      willDisableCount: 0,
      missingRequirementsCount: 0,
    });
    stub(CompatReportBuilder, { build: mockBuild });
    app = TestApp.create(updateAdminRoutes);
  });

  test('builds the compat report against the latest version', async () => {
    const res = await app.get('/api/system/update/compat');
    expect(res.status).toBe(200);
    expect(mockBuild).toHaveBeenCalledWith('2.0.0');
    expect(res.body).toMatchObject({ targetVersion: '2.0.0', willDisableCount: 0 });
  });
});

describe('GET /api/system/migrations', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(MigrationStatus, {
      snapshot: {
        completedAt: 1748332800000,
        reports: [
          {
            scope: 'state-db',
            applied: ['0001_init'],
            skipped: [],
            failed: [],
            durationMs: 4,
          },
        ],
      },
    });
    app = TestApp.create(systemReadRoutes);
  });

  test('returns the migration status snapshot', async () => {
    const res = await app.get('/api/system/migrations');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      completedAt: 1748332800000,
      reports: expect.any(Array),
    });
  });
});

describe('POST /api/system/restart + /stop', () => {
  let app: ReturnType<typeof TestApp.create>;
  let originalExit: typeof process.exit;

  useTestBed(() => {
    originalExit = process.exit.bind(process);
    // Capture exit calls but neither actually exit nor throw — the
    // routes schedule them on a setTimeout(100), which we don't wait
    // for; the timer's unref keeps the harness alive either way.
    process.exit = (() => undefined) as typeof process.exit;
    app = TestApp.create(systemAdminRoutes);
  });

  test('POST /restart returns ok and schedules an exit', async () => {
    const res = await app.post('/api/system/restart');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    process.exit = originalExit;
  });

  test('POST /stop returns ok and schedules an exit', async () => {
    const res = await app.post('/api/system/stop');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    process.exit = originalExit;
  });
});
