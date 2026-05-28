/**
 * Tests for the `brika version --json` payload.
 *
 * The installer/uninstaller scripts grep `"version":"..."` and
 * `"commit":"..."` out of this output to detect an existing install.
 * Both fields must be present and on a single line — assert the shape
 * directly via the pure builder rather than spawning the CLI.
 */

import { describe, expect, test } from 'bun:test';
import { CLI_VERSION } from '../version';
import { getVersionJsonPayload } from './version';

describe('getVersionJsonPayload', () => {
  const payload = getVersionJsonPayload();

  test('carries the CLI version (the field the installer reads)', () => {
    expect(payload.version).toBe(CLI_VERSION);
  });

  test('exposes every documented key', () => {
    expect(Object.keys(payload).sort()).toEqual(
      ['arch', 'branch', 'bun', 'buildTime', 'commit', 'commitDate', 'platform', 'version'].sort()
    );
  });

  test('platform + arch reflect the current process', () => {
    expect(payload.platform).toBe(process.platform);
    expect(payload.arch).toBe(process.arch);
  });

  test('bun reports a non-empty string runtime version', () => {
    expect(payload.bun).toBe(Bun.version);
    expect(payload.bun.length).toBeGreaterThan(0);
  });

  test('commit is either null (no git context) or a short SHA-shaped string', () => {
    // 7 chars at compile time, more for dev macro fallback — accept anything
    // up to a full SHA. The point is: never a multi-line dump.
    if (payload.commit !== null) {
      expect(payload.commit).toMatch(/^[0-9a-f]{4,40}$/i);
    }
  });

  test('serialises to a single line of valid JSON (installer contract)', () => {
    const line = JSON.stringify(payload);
    expect(line.includes('\n')).toBe(false);
    // Round-trips: the sed expression `s/.*"version":"\([^"]*\)".*/\1/p` in
    // install.sh works on any JSON line that contains the field.
    expect(line).toContain(`"version":"${CLI_VERSION}"`);
  });
});
