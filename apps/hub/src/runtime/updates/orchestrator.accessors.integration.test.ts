/**
 * Public-accessor coverage for `UpdateOrchestrator` — the existing
 * tests focus on `apply()` and the lock state machine; the getters
 * + `canApply` proxy are still exercised in production paths
 * (HTTP routes, status reporting) and need their own pins.
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateAuditLog } from './audit-log';
import { UpdateOrchestrator } from './orchestrator';
import type {
  StrategyApplyOptions,
  StrategyApplyResult,
  UpdateStrategy,
} from './strategies/strategy';
import { UpdateLock } from './update-lock';
import { VersionStateStore } from './version-state';

class CountingStrategy implements UpdateStrategy {
  readonly name = 'counting-test-strategy';
  canApplyCalls = 0;

  canApply(): boolean {
    this.canApplyCalls += 1;
    return false;
  }
  check(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return Promise.reject(new Error('not used'));
  }
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-orch-acc-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('UpdateOrchestrator accessors', () => {
  test('`strategyName` reflects the configured strategy', () => {
    const orch = UpdateOrchestrator.forTesting({
      mode: 'container',
      strategy: new CountingStrategy(),
      lock: new UpdateLock(tmp),
      audit: new UpdateAuditLog(tmp),
      versionState: new VersionStateStore(tmp, '0.6.0'),
    });
    expect(orch.strategyName).toBe('counting-test-strategy');
  });

  test('`mode` reflects the runtime mode override', () => {
    const orch = UpdateOrchestrator.forTesting({
      mode: 'container',
      strategy: new CountingStrategy(),
      lock: new UpdateLock(tmp),
      audit: new UpdateAuditLog(tmp),
      versionState: new VersionStateStore(tmp, '0.6.0'),
    });
    expect(orch.mode).toBe('container');
  });

  test('`canApply()` delegates to the strategy', () => {
    const strat = new CountingStrategy();
    const orch = UpdateOrchestrator.forTesting({
      mode: 'container',
      strategy: strat,
      lock: new UpdateLock(tmp),
      audit: new UpdateAuditLog(tmp),
      versionState: new VersionStateStore(tmp, '0.6.0'),
    });
    expect(orch.canApply()).toBe(false);
    expect(strat.canApplyCalls).toBe(1);
  });

  test('`peekLockHolder()` returns null when the lock is fresh', () => {
    const orch = UpdateOrchestrator.forTesting({
      mode: 'standalone',
      strategy: new CountingStrategy(),
      lock: new UpdateLock(tmp),
      audit: new UpdateAuditLog(tmp),
      versionState: new VersionStateStore(tmp, '0.6.0'),
    });
    expect(orch.peekLockHolder()).toBeNull();
  });
});
