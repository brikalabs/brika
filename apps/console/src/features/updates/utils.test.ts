/**
 * `subtitleFor` + `formatRelative` are pure formatters; we lock the
 * "now" reference by feeding ISO strings derived from `Date.now()` so
 * the bucket boundaries (<60s, <60m, <24h, else days) are exercised
 * deterministically.
 */
import { describe, expect, test } from 'bun:test';
import type { UpdateInfoDto } from '../../shared/cli/api/updates';
import { CHANNELS, formatRelative, subtitleFor } from './utils';

const baseInfo: UpdateInfoDto = {
  currentVersion: '1.0.0',
  latestVersion: '1.0.0',
  updateAvailable: false,
  devBuild: false,
  releaseUrl: '',
  releaseNotes: '',
  publishedAt: '',
  releaseCommit: '',
  currentCommit: '',
  assetName: null,
  assetSize: null,
  channel: 'stable',
  lastCheckedAt: null,
};

describe('CHANNELS', () => {
  test('exposes stable then canary', () => {
    expect(CHANNELS).toEqual(['stable', 'canary']);
  });
});

describe('subtitleFor', () => {
  test('null → "loading…"', () => {
    expect(subtitleFor(null)).toBe('loading…');
  });

  test('devBuild wins over updateAvailable', () => {
    const subtitle = subtitleFor({
      ...baseInfo,
      devBuild: true,
      updateAvailable: true,
      latestVersion: '2.0.0',
    });
    expect(subtitle).toBe('dev build · ahead of latest release');
  });

  test('updateAvailable surfaces the latest version', () => {
    expect(
      subtitleFor({
        ...baseInfo,
        updateAvailable: true,
        latestVersion: '1.2.3',
      })
    ).toBe('v1.2.3 is available');
  });

  test('default → "up to date"', () => {
    expect(subtitleFor(baseInfo)).toBe('up to date');
  });
});

describe('formatRelative', () => {
  test('returns the input unchanged when not a parseable date', () => {
    expect(formatRelative('not-a-date')).toBe('not-a-date');
  });

  test('< 60s → seconds bucket', () => {
    const iso = new Date(Date.now() - 5_000).toISOString();
    expect(formatRelative(iso)).toMatch(/^\ds ago$/);
  });

  test('< 60min → minutes bucket', () => {
    const iso = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('10m ago');
  });

  test('< 24h → hours bucket', () => {
    const iso = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('3h ago');
  });

  test('>= 24h → days bucket', () => {
    const iso = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelative(iso)).toBe('2d ago');
  });
});
