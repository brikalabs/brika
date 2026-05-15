/**
 * Race-safe spawn for multi-TUI scenarios. The full spawn path is
 * intentionally not exercised here — spawning a real `brika hub`
 * subprocess in unit tests is heavy and brittle. We cover the cheap
 * pre-check branch, which is what guarantees N concurrent TUIs
 * never race on `claimPidFile()` once at least one hub is up.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnHubDetached } from './hub-spawn-detached';

describe('spawnHubDetached', () => {
  let home: string;
  let original: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-spawn-detached-'));
    original = process.env.BRIKA_HOME;
    process.env.BRIKA_HOME = home;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = original;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test('returns the existing PID without forking when a hub is already running', async () => {
    // `process.pid` is always a running process from this test's POV,
    // so `checkPid` returns `running` and `spawnHubDetached` short-
    // circuits before ever calling `Bun.spawn`.
    writeFileSync(join(home, 'brika.pid'), String(process.pid), 'utf8');
    const pid = await spawnHubDetached();
    expect(pid).toBe(process.pid);
  });
});
