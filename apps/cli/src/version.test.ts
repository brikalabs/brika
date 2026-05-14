import { describe, expect, test } from 'bun:test';
import { CLI_VERSION } from './version';

describe('CLI_VERSION', () => {
  test('exposes a semver-shaped string', () => {
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
