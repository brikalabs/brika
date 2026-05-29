/**
 * Launcher selection + wrap semantics. Doesn't actually spawn
 * sandbox-exec — just checks the plan object the launcher produces.
 */

import { describe, expect, test } from 'bun:test';
import { pickLauncher, readSandboxModeFromEnv } from './index';
import { macosLauncher } from './macos-launcher';
import { noopLauncher } from './noop-launcher';
import type { SandboxProfile } from './types';

const PROFILE: SandboxProfile = {
  pluginUid: 'plug-1',
  readableDirs: ['/plug/bundle'],
  writableDirs: ['/plug/data'],
  allowNetwork: false,
};

describe('noopLauncher', () => {
  test('returns the original cmd + args unchanged', () => {
    const plan = noopLauncher.wrap('/usr/local/bin/bun', ['--preload=p.ts', 'main.js'], PROFILE);
    expect(plan.cmd).toBe('/usr/local/bin/bun');
    expect(plan.args).toEqual(['--preload=p.ts', 'main.js']);
  });
});

describe('macosLauncher', () => {
  test('wraps the command in sandbox-exec with an SBPL string', () => {
    const plan = macosLauncher.wrap('/usr/local/bin/bun', ['--preload=p.ts', 'main.js'], PROFILE);
    expect(plan.cmd).toBe('/usr/bin/sandbox-exec');
    expect(plan.args[0]).toBe('-p');
    expect(plan.args[1]).toContain('(deny default)');
    expect(plan.args.slice(2)).toEqual(['/usr/local/bin/bun', '--preload=p.ts', 'main.js']);
  });

  test('embeds the scope-derived writable dirs in the SBPL profile', () => {
    const plan = macosLauncher.wrap('/usr/local/bin/bun', [], PROFILE);
    // Read-only dirs aren't emitted explicitly (file-read* is global).
    // Writable dirs become file-write* subpath rules.
    expect(plan.args[1]).toContain('(allow file-write* (subpath "/plug/data"))');
    // The profile baseline includes broad reads.
    expect(plan.args[1]).toContain('(allow file-read*)');
  });
});

describe('pickLauncher', () => {
  test('off mode returns the noop launcher unconditionally', () => {
    expect(pickLauncher('off').name).toBe('noop');
  });

  test('permissive mode returns the noop launcher (with a logging upgrade later)', () => {
    expect(pickLauncher('permissive').name).toBe('noop');
  });

  test('enforce mode on darwin returns macos launcher', () => {
    const picked = pickLauncher('enforce');
    if (process.platform === 'darwin') {
      expect(picked.name).toBe('macos-sandbox-exec');
    } else {
      // Linux + Windows fall back to noop pending native launchers.
      expect(picked.name).toBe('noop');
    }
  });
});

describe('readSandboxModeFromEnv', () => {
  test('defaults to enforce when env is unset', () => {
    expect(readSandboxModeFromEnv({})).toBe('enforce');
  });

  test('reads "off" and "permissive" verbatim', () => {
    expect(readSandboxModeFromEnv({ BRIKA_SANDBOX_MODE: 'off' })).toBe('off');
    expect(readSandboxModeFromEnv({ BRIKA_SANDBOX_MODE: 'permissive' })).toBe('permissive');
  });

  test('treats garbage values as enforce (fail-safe)', () => {
    expect(readSandboxModeFromEnv({ BRIKA_SANDBOX_MODE: 'banana' })).toBe('enforce');
  });
});
