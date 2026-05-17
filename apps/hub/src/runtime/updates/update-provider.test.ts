/**
 * UpdateProvider DI seam.
 *
 *   - The base class throws if anyone calls it without binding a
 *     concrete implementation first.
 *   - GitHubUpdateProvider delegates to the module-level
 *     `checkForUpdate` / `applyUpdate` so consumers can swap providers
 *     without rewriting the rest of the hub.
 *
 * We mock `Bun.fetch` so the delegation smoke test doesn't talk to the
 * real GitHub API.
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { GitHubUpdateProvider, UpdateProvider } from './update-provider';

describe('UpdateProvider (base)', () => {
  const base = new UpdateProvider();

  test('check() throws — must register a concrete subclass', () => {
    expect(() => base.check('stable')).toThrow(/not implemented/);
  });

  test('apply() throws — must register a concrete subclass', () => {
    expect(() => base.apply({})).toThrow(/not implemented/);
  });
});

describe('GitHubUpdateProvider', () => {
  const bun = useBunMock();
  const provider = new GitHubUpdateProvider();

  test('check() delegates to the module-level checkForUpdate', async () => {
    bun.fetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            tag_name: 'v99.0.0',
            target_commitish: 'mock-commit',
            published_at: '2026-01-01T00:00:00Z',
            html_url: 'https://github.com/example/releases/v99.0.0',
            body: 'notes',
            assets: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const info = await provider.check('stable');
    expect(info.latestVersion).toBe('99.0.0');
    expect(info.updateAvailable).toBe(true);
    expect(info.channel).toBe('stable');
  });

  test('apply() rejects when the underlying updater errors', async () => {
    bun.fetch(() => Promise.reject(new Error('network down')));
    await expect(provider.apply({ force: true })).rejects.toBeDefined();
  });
});
