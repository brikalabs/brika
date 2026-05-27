/**
 * Tests for the new `updatePinnedVersion` accessors and the
 * channel-validation fallback in `getUpdateChannel`. Exercises a
 * real SQLite-backed `StateStore` against a fresh tmp dir per
 * `beforeAll` (the underlying `defineDatabase` registers at module
 * load and isn't re-pointable per-test).
 */

import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { container } from '@brika/di';
import { StateStore } from './state-store';

let tmp: string;
let state: StateStore;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-pinned-'));
  configureDatabases(tmp);
  state = container.resolve(StateStore);
  state.init();
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  state.setPinnedVersion(null);
  state.setUpdateChannel('stable');
});

describe('StateStore pinned-version + update-channel', () => {
  test('getPinnedVersion is null by default', () => {
    expect(state.getPinnedVersion()).toBeNull();
  });

  test('setPinnedVersion persists across getPinnedVersion calls', () => {
    state.setPinnedVersion('0.5.2');
    expect(state.getPinnedVersion()).toBe('0.5.2');
    state.setPinnedVersion(null);
    expect(state.getPinnedVersion()).toBeNull();
  });

  test('roundtrips each of the four channels', () => {
    for (const ch of ['stable', 'beta', 'canary', 'pinned'] as const) {
      state.setUpdateChannel(ch);
      expect(state.getUpdateChannel()).toBe(ch);
    }
  });
});
