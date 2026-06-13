/**
 * RuntimeMode detection tests.
 *
 * Uses the pure `computeRuntimeMode` so we can pump in any combination
 * of env vars, exec paths, and a stubbed `/.dockerenv` check without
 * touching the real environment.
 */

import { describe, expect, test } from 'bun:test';
import { canSelfUpdate, computeRuntimeMode } from './runtime-mode';

const baseInput = {
  isCompiled: true,
  execPath: '/Users/example/.brika/bin/brika',
  env: {},
  dockerEnvExists: () => false,
} as const;

describe('computeRuntimeMode', () => {
  test('explicit BRIKA_RUNTIME_MODE wins over auto-detection', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        env: { BRIKA_RUNTIME_MODE: 'container' },
      })
    ).toBe('container');
  });

  test('unknown override value falls back to auto-detection (typo guard)', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        env: { BRIKA_RUNTIME_MODE: 'kontaynr' },
      })
    ).toBe('standalone');
  });

  test('/.dockerenv presence detects container', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        dockerEnvExists: () => true,
      })
    ).toBe('container');
  });

  test('`container` env var (set by Docker / systemd-nspawn) detects container', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        env: { container: 'docker' },
      })
    ).toBe('container');
  });

  test('SYSTEMD_EXEC_PID detects supervised', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        env: { SYSTEMD_EXEC_PID: '12345' },
      })
    ).toBe('supervised');
  });

  test('LAUNCHD_SOCKET detects supervised', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        env: { LAUNCHD_SOCKET: '/var/run/launchd.sock' },
      })
    ).toBe('supervised');
  });

  test('/usr/bin prefix detects system-package', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        execPath: '/usr/bin/brika',
      })
    ).toBe('system-package');
  });

  test('/opt/homebrew/bin prefix detects system-package', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        execPath: '/opt/homebrew/bin/brika',
      })
    ).toBe('system-package');
  });

  test('BRIKA_INSTALL=npm detects system-package (npm owns the binary, no self-update)', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        // The npm-cached binary lives under the data dir, not a system prefix.
        execPath: '/Users/example/.brika/npm-bin/0.4.0/brika',
        env: { BRIKA_INSTALL: 'npm' },
      })
    ).toBe('system-package');
  });

  test('non-compiled (running from source) detects dev', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        isCompiled: false,
      })
    ).toBe('dev');
  });

  test('default (compiled, no special env, user-owned path) detects standalone', () => {
    expect(computeRuntimeMode(baseInput)).toBe('standalone');
  });

  test('container detection beats system-package path (running in a Docker image where binary is in /usr/bin)', () => {
    expect(
      computeRuntimeMode({
        ...baseInput,
        execPath: '/usr/bin/brika',
        dockerEnvExists: () => true,
      })
    ).toBe('container');
  });
});

describe('canSelfUpdate', () => {
  test('standalone can self-update', () => {
    expect(canSelfUpdate('standalone')).toBe(true);
  });

  test('supervised can self-update (staged + supervisor restart)', () => {
    expect(canSelfUpdate('supervised')).toBe(true);
  });

  test('dev cannot self-update — matches DevStrategy.canApply()', () => {
    expect(canSelfUpdate('dev')).toBe(false);
  });

  test('container cannot self-update', () => {
    expect(canSelfUpdate('container')).toBe(false);
  });

  test('system-package cannot self-update', () => {
    expect(canSelfUpdate('system-package')).toBe(false);
  });
});
