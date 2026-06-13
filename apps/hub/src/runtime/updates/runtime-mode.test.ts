/**
 * RuntimeMode detection tests.
 *
 * Uses the pure `computeRuntimeMode` so we can pump in any combination
 * of env vars, exec paths, and a stubbed `/.dockerenv` check without
 * touching the real environment.
 */

import { describe, expect, test } from 'bun:test';
import { canSelfUpdate, computeRuntimeMode, type RuntimeMode } from './runtime-mode';

type DetectInput = Parameters<typeof computeRuntimeMode>[0];

const baseInput: DetectInput = {
  isCompiled: true,
  execPath: '/Users/example/.brika/bin/brika',
  env: {},
  dockerEnvExists: () => false,
};

describe('computeRuntimeMode', () => {
  test.each<[string, Partial<DetectInput>, RuntimeMode]>([
    [
      'explicit BRIKA_RUNTIME_MODE wins over auto-detection',
      { env: { BRIKA_RUNTIME_MODE: 'container' } },
      'container',
    ],
    [
      'unknown override value falls back to auto-detection (typo guard)',
      { env: { BRIKA_RUNTIME_MODE: 'kontaynr' } },
      'standalone',
    ],
    ['/.dockerenv presence detects container', { dockerEnvExists: () => true }, 'container'],
    [
      '`container` env var (set by Docker / systemd-nspawn) detects container',
      { env: { container: 'docker' } },
      'container',
    ],
    ['SYSTEMD_EXEC_PID detects supervised', { env: { SYSTEMD_EXEC_PID: '12345' } }, 'supervised'],
    [
      'LAUNCHD_SOCKET detects supervised',
      { env: { LAUNCHD_SOCKET: '/var/run/launchd.sock' } },
      'supervised',
    ],
    ['/usr/bin prefix detects system-package', { execPath: '/usr/bin/brika' }, 'system-package'],
    [
      '/opt/homebrew/bin prefix detects system-package',
      { execPath: '/opt/homebrew/bin/brika' },
      'system-package',
    ],
    [
      'managed install via the marker detects system-package (package manager owns the binary, no self-update)',
      {
        execPath: '/usr/local/lib/node_modules/@brika/cli-linux-x64/bin/brika',
        env: { BRIKA_INSTALL: 'managed' },
      },
      'system-package',
    ],
    [
      'managed install via the node_modules path (marker stripped) still detects system-package',
      { execPath: '/usr/local/lib/node_modules/@brika/cli-darwin-arm64/bin/brika' },
      'system-package',
    ],
    [
      'non-compiled runtime under node_modules stays dev (not misread as a managed install)',
      { isCompiled: false, execPath: '/repo/node_modules/.bin/bun' },
      'dev',
    ],
    ['non-compiled (running from source) detects dev', { isCompiled: false }, 'dev'],
    ['default (compiled, no special env, user-owned path) detects standalone', {}, 'standalone'],
    [
      'container detection beats system-package path (running in a Docker image where binary is in /usr/bin)',
      { execPath: '/usr/bin/brika', dockerEnvExists: () => true },
      'container',
    ],
  ])('%s', (_name, overrides, expected) => {
    expect(computeRuntimeMode({ ...baseInput, ...overrides })).toBe(expected);
  });
});

describe('canSelfUpdate', () => {
  test.each<[string, RuntimeMode, boolean]>([
    ['standalone can self-update', 'standalone', true],
    ['supervised can self-update (staged + supervisor restart)', 'supervised', true],
    ['dev cannot self-update (matches DevStrategy.canApply())', 'dev', false],
    ['container cannot self-update', 'container', false],
    ['system-package cannot self-update', 'system-package', false],
  ])('%s', (_name, mode, expected) => {
    expect(canSelfUpdate(mode)).toBe(expected);
  });
});
