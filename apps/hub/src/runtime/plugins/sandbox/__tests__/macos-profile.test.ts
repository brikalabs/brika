/**
 * Unit tests for `buildMacosProfile`.
 *
 * The SBPL string is the security contract — every assertion below
 * is checking the kernel-level rule set: broad file READS allowed
 * (so Bun's runtime can start), narrow file WRITES bound to the
 * scope's writable dirs, network gated.
 */

import { describe, expect, test } from 'bun:test';
import { buildMacosProfile } from '../macos-profile';
import type { SandboxProfile } from '../types';

const BASE: SandboxProfile = {
  pluginUid: 'plug-1',
  readableDirs: [],
  writableDirs: [],
  allowNetwork: false,
};

describe('buildMacosProfile — default stance', () => {
  test('starts with the SBPL preamble + deny default', () => {
    const out = buildMacosProfile(BASE);
    const lines = out.split('\n');
    expect(lines[0]).toBe('(version 1)');
    expect(lines[1]).toBe('(deny default)');
  });

  test('process lifecycle allows are always present (Bun would SIGABRT without them)', () => {
    const out = buildMacosProfile(BASE);
    expect(out).toContain('(allow process-fork)');
    expect(out).toContain('(allow process-exec*)');
    expect(out).toContain('(allow process-info* (target self))');
    expect(out).toContain('(allow signal (target self))');
  });

  test('system glue rules Bun needs at startup are present', () => {
    const out = buildMacosProfile(BASE);
    expect(out).toContain('(allow ipc-posix-shm*)');
    expect(out).toContain('(allow iokit-open*)');
    expect(out).toContain('(allow mach-lookup)');
    expect(out).toContain('(allow sysctl-read)');
  });

  test('broad file READS are always allowed (L2 grant vector gates plugin access)', () => {
    const out = buildMacosProfile(BASE);
    expect(out).toContain('(allow file-read*)');
  });

  test("Bun's runtime temp dirs are writable so module resolution works", () => {
    const out = buildMacosProfile(BASE);
    expect(out).toContain('(allow file-write* (subpath "/private/var/folders"))');
    expect(out).toContain('(allow file-write* (subpath "/private/tmp"))');
  });

  test('unix-domain sockets are allowed even with network off (hub IPC)', () => {
    const out = buildMacosProfile(BASE);
    expect(out).toContain('(allow network* (local unix))');
    // The bare `(allow network*)` should NOT appear when allowNetwork=false.
    expect(out.split('\n')).not.toContain('(allow network*)');
  });
});

describe('buildMacosProfile — scope-derived allows', () => {
  test('writable dirs become file-write* subpath rules', () => {
    const out = buildMacosProfile({
      ...BASE,
      writableDirs: ['/plug/data/scratch', '/plug/cache'],
    });
    expect(out).toContain('(allow file-write* (subpath "/plug/data/scratch"))');
    expect(out).toContain('(allow file-write* (subpath "/plug/cache"))');
  });

  test('readable dirs do not add explicit write rules (reads are global)', () => {
    const out = buildMacosProfile({
      ...BASE,
      readableDirs: ['/plug/data/bundle'],
      writableDirs: [],
    });
    // No write* rule should be emitted for a read-only dir.
    expect(out).not.toContain('(allow file-write* (subpath "/plug/data/bundle"))');
  });

  test('allowNetwork: true opens full network*', () => {
    const out = buildMacosProfile({ ...BASE, allowNetwork: true });
    expect(out.split('\n')).toContain('(allow network*)');
  });

  test('no scope yields no extra write allows beyond the Bun-runtime baseline', () => {
    const out = buildMacosProfile(BASE);
    // Check no rogue write to a /Users path snuck in.
    expect(out).not.toContain('(allow file-write* (subpath "/Users');
    // Only two writable subpaths in the default (var/folders + tmp).
    const writeCount = (out.match(/\(allow file-write\*/g) ?? []).length;
    expect(writeCount).toBe(2);
  });
});

describe('buildMacosProfile — path quoting safety', () => {
  test('paths with embedded double quotes get escaped', () => {
    const out = buildMacosProfile({
      ...BASE,
      writableDirs: ['/plug/with"quote'],
    });
    expect(out).toContain(String.raw`"/plug/with\"quote"`);
  });

  test('paths with backslashes get escaped', () => {
    const out = buildMacosProfile({
      ...BASE,
      writableDirs: [String.raw`/plug/with\backslash`],
    });
    expect(out).toContain(String.raw`"/plug/with\\backslash"`);
  });
});
