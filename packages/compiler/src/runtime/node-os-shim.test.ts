/**
 * Unit tests for the `node:os` shim.
 *
 * Sanitised values must stay sanitised — these tests are the contract
 * a future "tighten the shim" PR mustn't accidentally regress.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const SHIM_PATH = './node-os-shim';

/**
 * Reset the env vars + module cache between tests so each can stage
 * its own scenario. Bun's loader caches the module body on first import,
 * so we use `await import(...)` after a cache-bust to re-evaluate.
 */
const ENV_KEYS = [
  'BRIKA_PLUGIN_TMPDIR',
  'BRIKA_PLUGIN_HOMEDIR',
  'BRIKA_PLUGIN_HOSTNAME',
  'BRIKA_PLUGIN_CPU_COUNT',
];
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = originalEnv[k];
    }
  }
});

/**
 * Import the shim freshly. Bun caches modules by URL — appending a
 * timestamp query gives a fresh evaluation each time, so the
 * module-level `const HOSTNAME = readNonEmpty('BRIKA_PLUGIN_HOSTNAME', …)`
 * re-runs against the current process.env.
 */
async function loadShim() {
  const url = new URL(`${SHIM_PATH}?t=${Date.now()}_${Math.random()}`, import.meta.url);
  return await import(url.href);
}

describe('node:os shim — defaults', () => {
  test('hostname is the safe constant when env is unset', async () => {
    const os = await loadShim();
    expect(os.hostname()).toBe('brika-plugin');
  });

  test('tmpdir falls back to /tmp when env is unset', async () => {
    const os = await loadShim();
    expect(os.tmpdir()).toBe('/tmp');
  });

  test('homedir falls back to a non-host path when env is unset', async () => {
    const os = await loadShim();
    expect(os.homedir()).toBe('/home/brika-plugin');
  });

  test('cpu count falls back to 4 when env is unset', async () => {
    const os = await loadShim();
    expect(os.cpus()).toHaveLength(4);
    expect(os.availableParallelism()).toBe(4);
  });
});

describe('node:os shim — env overrides', () => {
  test('hostname honours BRIKA_PLUGIN_HOSTNAME', async () => {
    process.env.BRIKA_PLUGIN_HOSTNAME = 'sandbox-42';
    const os = await loadShim();
    expect(os.hostname()).toBe('sandbox-42');
  });

  test('tmpdir honours BRIKA_PLUGIN_TMPDIR', async () => {
    process.env.BRIKA_PLUGIN_TMPDIR = '/plug/tmp';
    const os = await loadShim();
    expect(os.tmpdir()).toBe('/plug/tmp');
  });

  test('cpu count parses BRIKA_PLUGIN_CPU_COUNT', async () => {
    process.env.BRIKA_PLUGIN_CPU_COUNT = '8';
    const os = await loadShim();
    expect(os.cpus()).toHaveLength(8);
    expect(os.availableParallelism()).toBe(8);
  });

  test('invalid cpu count (non-numeric) falls back', async () => {
    process.env.BRIKA_PLUGIN_CPU_COUNT = 'banana';
    const os = await loadShim();
    expect(os.cpus()).toHaveLength(4);
  });

  test('cpu count of 0 or negative falls back to default', async () => {
    process.env.BRIKA_PLUGIN_CPU_COUNT = '0';
    const os = await loadShim();
    expect(os.cpus()).toHaveLength(4);
  });
});

describe('node:os shim — sanitisation', () => {
  test('userInfo returns synthetic identity, never the host user', async () => {
    const os = await loadShim();
    const info = os.userInfo();
    expect(info.uid).toBe(-1);
    expect(info.gid).toBe(-1);
    expect(info.username).toBe('brika-plugin');
    expect(info.shell).toBeNull();
  });

  test('totalmem / freemem / uptime / loadavg are sanitised to zero', async () => {
    const os = await loadShim();
    expect(os.totalmem()).toBe(0);
    expect(os.freemem()).toBe(0);
    expect(os.uptime()).toBe(0);
    expect(os.loadavg()).toEqual([0, 0, 0]);
  });

  test('networkInterfaces is always empty', async () => {
    const os = await loadShim();
    expect(os.networkInterfaces()).toEqual({});
  });

  test('release/version are placeholders, never the kernel version', async () => {
    const os = await loadShim();
    expect(os.release()).toBe('sanitized');
    expect(os.version()).toBe('sanitized');
  });

  test('cpu model and timings are sanitised (count is honest)', async () => {
    const os = await loadShim();
    for (const cpu of os.cpus()) {
      expect(cpu.model).toBe('');
      expect(cpu.speed).toBe(0);
      expect(cpu.times).toEqual({ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 });
    }
  });
});

describe('node:os shim — truthful low-risk values', () => {
  test('platform matches process.platform', async () => {
    const os = await loadShim();
    expect(os.platform()).toBe(process.platform);
  });

  test('arch matches process.arch', async () => {
    const os = await loadShim();
    expect(os.arch()).toBe(process.arch);
  });

  test('EOL reflects platform', async () => {
    const os = await loadShim();
    const expected = process.platform === 'win32' ? '\r\n' : '\n';
    expect(os.EOL).toBe(expected);
  });

  test('type returns OS family name derived from platform', async () => {
    const os = await loadShim();
    const t = os.type();
    if (process.platform === 'darwin') {
      expect(t).toBe('Darwin');
    } else if (process.platform === 'win32') {
      expect(t).toBe('Windows_NT');
    } else {
      expect(t).toBe('Linux');
    }
  });

  test('endianness reports LE (every supported Bun target is LE)', async () => {
    const os = await loadShim();
    expect(os.endianness()).toBe('LE');
  });
});

describe('node:os shim — default export aggregates named exports', () => {
  test('default export contains every named API', async () => {
    const os = await loadShim();
    const def = os.default;
    expect(typeof def.platform).toBe('function');
    expect(typeof def.tmpdir).toBe('function');
    expect(typeof def.cpus).toBe('function');
    expect(typeof def.networkInterfaces).toBe('function');
    expect(def.EOL).toBe(os.EOL);
  });

  test('default and named export reference identical function instances', async () => {
    const os = await loadShim();
    // Libraries occasionally compare function identity to detect
    // monkey-patching; preserving identity avoids surprising them.
    expect(os.default.platform).toBe(os.platform);
    expect(os.default.cpus).toBe(os.cpus);
  });
});
