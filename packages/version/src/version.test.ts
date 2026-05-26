/**
 * Smoke test: the exported version constant is a non-empty semver string.
 * Also pins the value against root `package.json` so a missed `bun run
 * bump` shows up here instead of in a CI release artifact.
 */

import { describe, expect, test } from 'bun:test';
import rootPkg from '../../../package.json' with { type: 'json' };
import { BRIKA_VERSION } from './index';

describe('BRIKA_VERSION', () => {
  test('is a non-empty string', () => {
    expect(typeof BRIKA_VERSION).toBe('string');
    expect(BRIKA_VERSION.length).toBeGreaterThan(0);
  });

  test('matches the monorepo root package.json version', () => {
    expect(BRIKA_VERSION).toBe(rootPkg.version);
  });

  test('looks semver-ish', () => {
    expect(BRIKA_VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u);
  });
});
