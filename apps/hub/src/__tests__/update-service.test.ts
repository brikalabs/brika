/**
 * Tests for UpdateService — caching, error handling, state transitions.
 */
import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { buildInfo } from '@/runtime/http/routes/status';
import { Logger } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';
import { UpdateService } from '@/runtime/updates/update-service';

function mockGitHub(
  bun: ReturnType<typeof useBunMock>,
  tagName: string,
  options?: {
    status?: number;
    targetCommitish?: string;
  }
) {
  bun.fetch(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          tag_name: tagName,
          target_commitish: options?.targetCommitish ?? 'mock-commit',
          published_at: '2026-01-01T00:00:00Z',
          html_url: `https://github.com/example/releases/${tagName}`,
          body: 'Release notes',
          assets: [],
        }),
        {
          status: options?.status ?? 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )
  );
}

describe('UpdateService', () => {
  const bun = useBunMock();
  let service: UpdateService;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      stub(StateStore, { getUpdateChannel: () => 'stable' });
      service = get(UpdateService);
    }
  );

  test('initial state has null cache and zero timestamp', () => {
    expect(service.cachedInfo).toBeNull();
    expect(service.lastCheckedAt).toBe(0);
  });

  test('check() returns update info and caches it', async () => {
    mockGitHub(bun, 'v99.0.0');

    const result = await service.check();

    expect(result.latestVersion).toBe('99.0.0');
    expect(result.updateAvailable).toBe(true);
    expect(service.cachedInfo).toBe(result);
    expect(service.lastCheckedAt).toBeGreaterThan(0);
  });

  test('check() caches false when already on latest', async () => {
    const { hub } = await import('@/hub');
    mockGitHub(bun, `v${hub.version}`, {
      targetCommitish: buildInfo.commitFull,
    });

    const result = await service.check();

    expect(result.updateAvailable).toBe(false);
    expect(result.currentVersion).toBe(hub.version);
  });

  test('check() returns fallback on network error when no cache', async () => {
    bun.fetch(() => Promise.reject(new Error('Network error')));

    const result = await service.check();

    expect(result.updateAvailable).toBe(false);
    expect(result.assetName).toBeNull();
    expect(result.assetSize).toBeNull();
  });

  test('check() returns stale cache on subsequent network error', async () => {
    // First check succeeds and populates cache
    mockGitHub(bun, 'v99.0.0');
    await service.check();

    // Second check fails — should return stale cache
    bun.fetch(() => Promise.reject(new Error('Offline')));
    const result = await service.check();

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('99.0.0');
  });

  test('stop() can be called without start() without throwing', () => {
    expect(() => service.stop()).not.toThrow();
  });

  test('start() then stop() clears the timer', () => {
    mockGitHub(bun, 'v1.0.0');
    service.start();
    expect(() => service.stop()).not.toThrow();
  });
});
