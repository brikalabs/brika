/**
 * UpdateOrchestrator tests — focus on what the orchestrator adds on
 * top of the strategies: file lock, single-flight, audit log, refusal
 * dispatch. Strategy behavior is covered by `strategies/refusal.test.ts`.
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateAuditLog } from './audit-log';
import { UpdateOrchestrator } from './orchestrator';
import { ContainerStrategy } from './strategies/container';
import type {
  StrategyApplyOptions,
  StrategyApplyResult,
  UpdateStrategy,
} from './strategies/strategy';
import { UpdateRefusedError } from './strategies/strategy';
import { UpdateLock, UpdateLockHeldError } from './update-lock';
import { VersionStateStore } from './version-state';

class FakeStrategy implements UpdateStrategy {
  readonly name = 'fake';
  applies = 0;
  delay = 0;
  shouldFail = false;
  shouldRefuseSync = false;

  canApply(): boolean {
    return !this.shouldRefuseSync;
  }

  check(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async apply(options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    this.applies += 1;
    options.onProgress?.('downloading', 'fake progress');
    if (this.delay > 0) {
      await new Promise((r) => setTimeout(r, this.delay));
    }
    if (this.shouldFail) {
      throw new Error('boom');
    }
    return {
      previousVersion: '0.5.0',
      previousCommit: 'abc1234',
      newVersion: '0.6.0',
      newCommit: 'def5678',
    };
  }
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-orch-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeOrchestrator(strategy: UpdateStrategy): UpdateOrchestrator {
  return UpdateOrchestrator.forTesting({
    mode: 'standalone',
    strategy,
    lock: new UpdateLock(tmp),
    audit: new UpdateAuditLog(tmp),
    versionState: new VersionStateStore(tmp, '0.5.0'),
  });
}

describe('UpdateOrchestrator', () => {
  test('happy path: writes apply.start + apply.phase + apply.success to audit log', async () => {
    const strategy = new FakeStrategy();
    const orch = makeOrchestrator(strategy);

    const result = await orch.apply({ force: true });
    expect(result.newVersion).toBe('0.6.0');
    expect(strategy.applies).toBe(1);

    const audit = readFileSync(join(tmp, 'updates.log'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const kinds = audit.map((e) => e.kind);
    expect(kinds).toContain('apply.start');
    expect(kinds).toContain('apply.phase');
    expect(kinds).toContain('apply.success');
  });

  test('concurrent in-process applies share one promise (single-flight)', async () => {
    const strategy = new FakeStrategy();
    strategy.delay = 20;
    const orch = makeOrchestrator(strategy);

    const [a, b] = await Promise.all([orch.apply({}), orch.apply({})]);
    expect(a).toEqual(b);
    expect(strategy.applies).toBe(1);
  });

  test('cross-process simulation: held lock causes second orchestrator to reject with UpdateLockHeldError', async () => {
    const strategyA = new FakeStrategy();
    strategyA.delay = 50;
    const lock = new UpdateLock(tmp);
    const orchA = UpdateOrchestrator.forTesting({
      mode: 'standalone',
      strategy: strategyA,
      lock,
      audit: new UpdateAuditLog(tmp),
      versionState: new VersionStateStore(tmp, '0.5.0'),
    });

    // Start the first apply (acquires lock asynchronously); without
    // awaiting it, kick off a second orchestrator that shares the same
    // lock file path. The second one must observe the existing lock.
    const inflight = orchA.apply({});
    // Give the first apply a tick to acquire.
    await new Promise((r) => setTimeout(r, 5));

    const orchB = UpdateOrchestrator.forTesting({
      mode: 'standalone',
      strategy: new FakeStrategy(),
      lock: new UpdateLock(tmp),
      audit: new UpdateAuditLog(tmp),
      versionState: new VersionStateStore(tmp, '0.5.0'),
    });
    await expect(orchB.apply({})).rejects.toBeInstanceOf(UpdateLockHeldError);

    // Let the first one finish so we don't leak the lock between tests.
    await inflight;
  });

  test('refused strategy rejects without acquiring the lock', async () => {
    const orch = makeOrchestrator(new ContainerStrategy());
    await expect(orch.apply({})).rejects.toBeInstanceOf(UpdateRefusedError);

    // Lock file must NOT have been created (would block future applies).
    const lock = new UpdateLock(tmp);
    expect(lock.isHeld()).toBe(false);
  });

  test('strategy failure releases the lock + audits apply.failure', async () => {
    const strategy = new FakeStrategy();
    strategy.shouldFail = true;
    const orch = makeOrchestrator(strategy);

    await expect(orch.apply({})).rejects.toBeDefined();

    // Lock released — a follow-up apply must be possible.
    expect(new UpdateLock(tmp).isHeld()).toBe(false);

    const audit = readFileSync(join(tmp, 'updates.log'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(audit.map((e) => e.kind)).toContain('apply.failure');
  });

  test('recordBootAttempt + recordBootSuccess wires through to VersionStateStore', () => {
    const orch = makeOrchestrator(new FakeStrategy());
    orch.recordBootAttempt();
    const after = new VersionStateStore(tmp, '0.5.0');
    expect(after.snapshot.lastBootAttemptedVersion).toBe('0.5.0');

    orch.recordBootSuccess();
    const final = new VersionStateStore(tmp, '0.5.0');
    expect(final.snapshot.lastBootSucceededVersion).toBe('0.5.0');
  });

  test('recordBootAttempt detects a previous crashed boot and audits boot.crash-detected', () => {
    // Seed an "attempted but never succeeded" state on disk.
    const seed = new VersionStateStore(tmp, '0.5.0');
    seed.recordBootAttempt();
    // No recordBootSuccess() — simulating a crash mid-boot.

    const orch = makeOrchestrator(new FakeStrategy());
    orch.recordBootAttempt();
    const audit = readFileSync(join(tmp, 'updates.log'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(audit.map((e) => e.kind)).toContain('boot.crash-detected');
  });
});
