/**
 * Tests for the dev-only fake-update layer. We focus on:
 *   - scenario resolution from env (case-insensitive, unknown values ignored)
 *   - shape parity with the real `UpdateInfo` for every scenario
 *   - the synthetic apply stream emits the right phases and shortcuts on error
 *   - the banner is loud, but only once per scenario
 */

import { describe, expect, mock, test } from 'bun:test';
import {
  _resetBannerForTests,
  buildFakeUpdateInfo,
  getActiveScenario,
  logMockBannerIfActive,
  MOCK_ENV_VAR,
  MOCK_SCENARIOS,
  runFakeApply,
} from './updater.mock';

describe('getActiveScenario', () => {
  test('returns null when the env var is unset', () => {
    expect(getActiveScenario({})).toBeNull();
  });

  test('returns null for unknown values', () => {
    expect(getActiveScenario({ [MOCK_ENV_VAR]: 'banana' })).toBeNull();
  });

  test('is case-insensitive and trims whitespace', () => {
    expect(getActiveScenario({ [MOCK_ENV_VAR]: '  AVAILABLE  ' })).toBe('available');
  });

  test('accepts every documented scenario', () => {
    for (const scenario of MOCK_SCENARIOS) {
      expect(getActiveScenario({ [MOCK_ENV_VAR]: scenario })).toBe(scenario);
    }
  });
});

describe('buildFakeUpdateInfo', () => {
  test('every scenario returns the full UpdateInfo shape', () => {
    for (const scenario of MOCK_SCENARIOS) {
      const info = buildFakeUpdateInfo({ scenario, channel: 'stable' });
      // We can't import UpdateInfo here (circular), so we assert the
      // surface explicitly. If the real type grows a field, this list
      // will outdate — that's the *point*; it forces a sync.
      expect(info).toEqual({
        currentVersion: expect.any(String),
        latestVersion: expect.any(String),
        updateAvailable: expect.any(Boolean),
        devBuild: expect.any(Boolean),
        channelMismatch: expect.any(Boolean),
        releaseUrl: expect.any(String),
        releaseNotes: expect.any(String),
        publishedAt: expect.any(String),
        releaseCommit: expect.any(String),
        currentCommit: expect.any(String),
        assetName: expect.any(String),
        assetSize: expect.any(Number),
        channel: 'stable',
      });
    }
  });

  test('`available` flips updateAvailable on and bumps the patch', () => {
    const info = buildFakeUpdateInfo({ scenario: 'available', channel: 'stable' });
    expect(info.updateAvailable).toBe(true);
    expect(info.devBuild).toBe(false);
    expect(info.channelMismatch).toBe(false);
    expect(info.latestVersion).not.toBe(info.currentVersion);
  });

  test('`dev-build` flips devBuild and inverts current/latest', () => {
    const info = buildFakeUpdateInfo({ scenario: 'dev-build', channel: 'stable' });
    expect(info.devBuild).toBe(true);
    expect(info.updateAvailable).toBe(false);
    // current is ahead of latest
    expect(info.currentVersion > info.latestVersion).toBe(true);
  });

  test('`channel-mismatch` flips channelMismatch and uses a pre-release tag', () => {
    const info = buildFakeUpdateInfo({ scenario: 'channel-mismatch', channel: 'stable' });
    expect(info.channelMismatch).toBe(true);
    expect(info.devBuild).toBe(false);
    expect(info.currentVersion).toContain('-');
  });

  test('`up-to-date` is a no-op (current === latest, no flags)', () => {
    const info = buildFakeUpdateInfo({ scenario: 'up-to-date', channel: 'stable' });
    expect(info.updateAvailable).toBe(false);
    expect(info.devBuild).toBe(false);
    expect(info.channelMismatch).toBe(false);
    expect(info.currentVersion).toBe(info.latestVersion);
  });

  test('channel is threaded through verbatim', () => {
    const info = buildFakeUpdateInfo({ scenario: 'available', channel: 'canary' });
    expect(info.channel).toBe('canary');
  });
});

describe('runFakeApply', () => {
  const noWait = () => Promise.resolve();

  test('emits every phase in order ending with complete', async () => {
    const events: string[] = [];
    await runFakeApply({
      scenario: 'available',
      onProgress: (e) => events.push(e.phase),
      sleep: noWait,
    });
    expect(events).toEqual([
      'checking',
      'downloading',
      'verifying',
      'extracting',
      'installing',
      'restarting',
      'complete',
    ]);
  });

  test('`apply-error` short-circuits mid-stream with an error event', async () => {
    const events: Array<{ phase: string; error?: string }> = [];
    await runFakeApply({
      scenario: 'apply-error',
      onProgress: (e) => events.push({ phase: e.phase, error: e.error }),
      sleep: noWait,
    });
    // Error fires when we *reach* `extracting`, so the UI gets to render
    // a few phases before failure (more realistic than failing on phase 0).
    expect(events.map((e) => e.phase)).toEqual([
      'checking',
      'downloading',
      'verifying',
      'error',
    ]);
    expect(events.at(-1)?.error).toContain('apply-error');
  });
});

describe('logMockBannerIfActive', () => {
  test('does nothing when the env is unset', () => {
    _resetBannerForTests();
    const log = mock((_msg: string) => undefined);
    logMockBannerIfActive(log, {});
    expect(log).not.toHaveBeenCalled();
  });

  test('logs once per scenario, then suppresses repeats', () => {
    _resetBannerForTests();
    const log = mock((_msg: string) => undefined);
    logMockBannerIfActive(log, { [MOCK_ENV_VAR]: 'available' });
    logMockBannerIfActive(log, { [MOCK_ENV_VAR]: 'available' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('available'));
  });

  test('re-emits when the scenario changes', () => {
    _resetBannerForTests();
    const log = mock((_msg: string) => undefined);
    logMockBannerIfActive(log, { [MOCK_ENV_VAR]: 'available' });
    logMockBannerIfActive(log, { [MOCK_ENV_VAR]: 'dev-build' });
    expect(log).toHaveBeenCalledTimes(2);
  });
});
