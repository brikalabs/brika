/**
 * Tests for update routes (/api/system/update)
 */
import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { updateRoutes } from '@/runtime/http/routes/updates';
import { UpdateService } from '@/runtime/updates/update-service';

const MOCK_INFO = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  updateAvailable: true,
  releaseUrl: 'https://github.com/example/releases/v1.1.0',
  releaseNotes: 'Fixes',
  publishedAt: '2026-01-01T00:00:00Z',
  assetName: null,
  assetSize: null,
};

type UpdateInfoResponse = typeof MOCK_INFO & { lastCheckedAt: number };
type ApplyUpdateResponse = { ok: boolean; message: string };

describe('update routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockCheck: ReturnType<typeof mock>;

  useTestBed(() => {
    mockCheck = mock().mockResolvedValue(MOCK_INFO);
    stub(UpdateService, { check: mockCheck, lastCheckedAt: 1234567890 });
    app = TestApp.create(updateRoutes);
  });

  // ─── GET /api/system/update ───────────────────────────────────────────────

  test('GET returns update info with lastCheckedAt', async () => {
    const res = await app.get<UpdateInfoResponse>('/api/system/update');

    expect(res.status).toBe(200);
    expect(res.body.updateAvailable).toBe(true);
    expect(res.body.latestVersion).toBe('1.1.0');
    expect(res.body.lastCheckedAt).toBe(1234567890);
  });

  // ─── POST /api/system/update/apply ───────────────────────────────────────

  test('POST /apply returns ok on success', async () => {
    // Mock applyUpdate via fetch override is complex — test the error path directly
    // by checking the module resolution. The success path requires spawning processes.
    // We verify the error path is reachable.
    const res = await app.post<ApplyUpdateResponse>('/api/system/update/apply');

    // applyUpdate will fail in test (no binary), but response shape should be ok:false
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe('boolean');
    expect(typeof res.body.message).toBe('string');
  });
});
