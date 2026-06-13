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
import { UpdateRefusedError } from './strategy';
import { SystemPackageStrategy } from './system-package';

describe('refusal strategies', () => {
  test.each([
    ['container', new ContainerStrategy(), 'UPDATE_CONTAINER'] as const,
    ['system-package', new SystemPackageStrategy(), 'UPDATE_SYSTEM_PACKAGE'] as const,
    ['dev', new DevStrategy(), 'UPDATE_DEV_MODE'] as const,
  ])('%s strategy refuses with %s', async (_name, strategy, expectedCode) => {
    expect(strategy.canApply()).toBe(false);
    try {
      await strategy.apply({});
      throw new Error('expected refusal');
    } catch (err) {
      if (!(err instanceof UpdateRefusedError)) {
        throw err;
      }
      expect(err.code).toBe(expectedCode);
      expect(err.guidance.length).toBeGreaterThan(0);
    }
  });

  test('system-package guidance is package-manager-aware', async () => {
    const expectGuidance = async (strategy: SystemPackageStrategy): Promise<string> => {
      try {
        await strategy.apply({});
        throw new Error('expected refusal');
      } catch (err) {
        if (!(err instanceof UpdateRefusedError)) {
          throw err;
        }
        return err.guidance;
      }
    };

    // OS package manager (default): point at brew/apt, never npm.
    const os = await expectGuidance(new SystemPackageStrategy('os'));
    expect(os).toContain('apt upgrade brika');
    expect(os).not.toContain('npm');

    // JS package manager: point at npm and friends, never apt/brew.
    const managed = await expectGuidance(new SystemPackageStrategy('managed'));
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
    const strategy = strategyForMode('system-package', { managed: true });
    try {
      await strategy.apply({});
      throw new Error('expected refusal');
    } catch (err) {
      if (!(err instanceof UpdateRefusedError)) {
        throw err;
      }
      expect(err.guidance).toContain('npm i -g brika@latest');
    }
  });

  test('dev maps to DevStrategy', () => {
    expect(strategyForMode('dev')).toBeInstanceOf(DevStrategy);
  });
});
