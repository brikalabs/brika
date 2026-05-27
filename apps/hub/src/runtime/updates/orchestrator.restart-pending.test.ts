/**
 * Regression: once an apply has succeeded and the route has called
 * `markRestartPending()`, any subsequent apply must be refused so
 * the imminent `process.exit` doesn't tear down a fresh download
 * mid-flight.
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
import { UpdateLock, UpdateLockHeldError } from './update-lock';
import { VersionStateStore } from './version-state';

class FakeStrategy implements UpdateStrategy {
  readonly name = 'fake';
  canApply(): boolean {
    return true;
  }
  check(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return Promise.resolve({
      previousVersion: '0.5.0',
      previousCommit: 'abc',
      newVersion: '0.6.0',
      newCommit: 'def',
    });
  }
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-orch-rp-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeOrchestrator(): UpdateOrchestrator {
  return UpdateOrchestrator.forTesting({
    mode: 'standalone',
    strategy: new FakeStrategy(),
    lock: new UpdateLock(tmp),
    audit: new UpdateAuditLog(tmp),
    versionState: new VersionStateStore(tmp, '0.5.0'),
  });
}

describe('UpdateOrchestrator.markRestartPending', () => {
  test('second apply after markRestartPending rejects with UpdateLockHeldError', async () => {
    const orch = makeOrchestrator();
    await orch.apply({});
    orch.markRestartPending();

    await expect(orch.apply({})).rejects.toBeInstanceOf(UpdateLockHeldError);
  });

  test('the synthetic error carries `startedAt: "restart-pending"`', async () => {
    const orch = makeOrchestrator();
    await orch.apply({});
    orch.markRestartPending();

    try {
      await orch.apply({});
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(UpdateLockHeldError);
      expect((err as UpdateLockHeldError).heldBy?.startedAt).toBe('restart-pending');
    }
  });

  test('audit log records the refusal reason', async () => {
    const orch = makeOrchestrator();
    await orch.apply({});
    orch.markRestartPending();
    await expect(orch.apply({})).rejects.toBeInstanceOf(UpdateLockHeldError);

    const log = await Bun.file(join(tmp, 'updates.log')).text();
    const events = log
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));
    const refused = events.filter((e) => e.kind === 'apply.refused');
    expect(refused.some((e) => e.data.reason === 'restart-pending')).toBe(true);
  });
});
