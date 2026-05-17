/**
 * Tests for the `brika update` formatters. We strip ANSI escapes before
 * asserting so picocolors doesn't make these tests brittle to TTY state.
 */

import { describe, expect, test } from 'bun:test';
import type { UpdateInfoDto } from '../shared/cli/api/updates';
import { formatStatus, isChannel, VALID_CHANNELS } from './update.helpers';

const ANSI = /\[[\d;]*m/g;
const plain = (s: string) => s.replace(ANSI, '');

function makeInfo(over: Partial<UpdateInfoDto> = {}): UpdateInfoDto {
  return {
    currentVersion: '0.3.0',
    latestVersion: '0.3.1',
    updateAvailable: true,
    devBuild: false,
    channelMismatch: false,
    releaseUrl: 'https://github.com/brikalabs/brika/releases/tag/v0.3.1',
    releaseNotes: '',
    publishedAt: '',
    releaseCommit: '',
    currentCommit: '',
    assetName: null,
    assetSize: null,
    channel: 'stable',
    lastCheckedAt: null,
    ...over,
  };
}

describe('isChannel', () => {
  test('accepts valid channel ids', () => {
    expect(isChannel('stable')).toBe(true);
    expect(isChannel('canary')).toBe(true);
  });

  test('rejects everything else', () => {
    expect(isChannel('beta')).toBe(false);
    expect(isChannel('')).toBe(false);
    expect(isChannel('STABLE')).toBe(false);
  });

  test('VALID_CHANNELS exposes the source of truth', () => {
    expect([...VALID_CHANNELS]).toEqual(['stable', 'canary']);
  });
});

describe('formatStatus', () => {
  test('renders "update available" with current → latest', () => {
    const out = plain(formatStatus(makeInfo()));
    expect(out).toContain('update available');
    expect(out).toContain('v0.3.0');
    expect(out).toContain('v0.3.1');
    expect(out).toContain('(stable)');
  });

  test('renders "up to date" when no update is available', () => {
    const out = plain(formatStatus(makeInfo({ updateAvailable: false })));
    expect(out).toContain('up to date');
    expect(out).not.toContain('update available');
  });

  test('renders "dev build" only when not on a published release', () => {
    const out = plain(
      formatStatus(makeInfo({ updateAvailable: false, devBuild: true }))
    );
    expect(out).toContain('dev build');
    expect(out).not.toContain('up to date');
  });

  test('shows the channel tag for canary', () => {
    const out = plain(formatStatus(makeInfo({ channel: 'canary' })));
    expect(out).toContain('(canary)');
  });

  test('ends with a single trailing newline', () => {
    const out = formatStatus(makeInfo());
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});
