/**
 * Tests for update routes (/api/system/update)
 */
import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { useBunMock } from '@brika/testing';
import { updateRoutes } from '@/runtime/http/routes/updates';
import { UpdateService } from '@/runtime/updates/update-service';

const MOCK_INFO = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  updateAvailable: true,
  devBuild: false,
  releaseUrl: 'https://github.com/example/releases/v1.1.0',
  releaseNotes: 'Fixes',
  publishedAt: '2026-01-01T00:00:00Z',
  releaseCommit: 'abc123',
  currentCommit: 'def456',
  assetName: null,
  assetSize: null,
};

type UpdateInfoResponse = typeof MOCK_INFO & { lastCheckedAt: number };

describe('update routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockCheck: ReturnType<typeof mock>;
  const bun = useBunMock();

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

  test('POST /apply returns SSE stream with progress events', async () => {
    // Mock fetch to prevent applyUpdate from making real network calls or
    // replacing binaries — without this, applyUpdate may succeed and call
    // process.exit(RESTART_CODE), killing the test process.
    bun.fetch(() => Promise.reject(new Error('Network unavailable in tests'))).apply();

    // Use hono.fetch directly to avoid TestApp body parsing (which hangs on SSE)
    const raw = await app.hono.fetch(
      new Request('http://test/api/system/update/apply', { method: 'POST' })
    );

    expect(raw.status).toBe(200);
    expect(raw.headers.get('Content-Type')).toBe('text/event-stream');

    // Read chunks until we get a progress event.
    // First chunk = 'checking', subsequent = error (from failed fetch).
    const reader = raw.body?.getReader();
    expect(reader).toBeDefined();

    const { value } = await reader!.read();
    await reader!.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: progress');
  });
});
