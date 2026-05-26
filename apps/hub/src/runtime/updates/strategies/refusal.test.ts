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
      expect(err).toBeInstanceOf(UpdateRefusedError);
      const refused = err as UpdateRefusedError;
      expect(refused.code).toBe(expectedCode);
      expect(refused.guidance.length).toBeGreaterThan(0);
    }
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

  test('dev maps to DevStrategy', () => {
    expect(strategyForMode('dev')).toBeInstanceOf(DevStrategy);
  });
});
