/**
 * Refusal strategies — container, system-package, and dev — must:
 *   - report canApply() === false
 *   - reject `apply()` with an UpdateRefusedError carrying a code
 *     that matches the strategy + a non-empty guidance string
 */

import { describe, expect, test } from 'bun:test';
import { ContainerStrategy } from './container';
import { DevStrategy } from './dev';
import { strategyForMode } from './index';
import { StandaloneStrategy } from './standalone';
import { type RefusalCode, UpdateRefusedError, type UpdateStrategy } from './strategy';
import { SystemPackageStrategy } from './system-package';

/** Run apply(), assert it refused with an UpdateRefusedError, and return that error. */
async function refusalOf(strategy: UpdateStrategy): Promise<UpdateRefusedError> {
  try {
    await strategy.apply({});
  } catch (err) {
    if (err instanceof UpdateRefusedError) {
      return err;
    }
    throw err;
  }
  throw new Error('expected apply() to refuse with an UpdateRefusedError');
}

describe('refusal strategies', () => {
  test.each<[string, UpdateStrategy, RefusalCode]>([
    ['container', new ContainerStrategy(), 'UPDATE_CONTAINER'],
    ['system-package', new SystemPackageStrategy(), 'UPDATE_SYSTEM_PACKAGE'],
    ['dev', new DevStrategy(), 'UPDATE_DEV_MODE'],
  ])('%s strategy refuses with %s', async (_name, strategy, expectedCode) => {
    expect(strategy.canApply()).toBe(false);
    const err = await refusalOf(strategy);
    expect(err.code).toBe(expectedCode);
    expect(err.guidance.length).toBeGreaterThan(0);
  });

  test('system-package guidance is package-manager-aware', async () => {
    // OS package manager (default): point at brew/apt, never npm.
    const os = (await refusalOf(new SystemPackageStrategy('os'))).guidance;
    expect(os).toContain('apt upgrade brika');
    expect(os).not.toContain('npm');

    // JS package manager: point at npm and friends, never apt/brew.
    const managed = (await refusalOf(new SystemPackageStrategy('managed'))).guidance;
    expect(managed).toContain('npm i -g brika@latest');
    expect(managed).toContain('pnpm add -g brika');
    expect(managed).not.toContain('apt upgrade');
  });
});

describe('strategyForMode', () => {
  test('standalone and supervised map to StandaloneStrategy', () => {
    expect(strategyForMode('standalone')).toBeInstanceOf(StandaloneStrategy);
    expect(strategyForMode('supervised')).toBeInstanceOf(StandaloneStrategy);
  });

  test('container maps to ContainerStrategy', () => {
    expect(strategyForMode('container')).toBeInstanceOf(ContainerStrategy);
  });

  test('system-package maps to SystemPackageStrategy', () => {
    expect(strategyForMode('system-package')).toBeInstanceOf(SystemPackageStrategy);
  });

  test('system-package with { managed } yields JS-package-manager guidance', async () => {
    const err = await refusalOf(strategyForMode('system-package', { managed: true }));
    expect(err.guidance).toContain('npm i -g brika@latest');
  });

  test('dev maps to DevStrategy', () => {
    expect(strategyForMode('dev')).toBeInstanceOf(DevStrategy);
  });
});
