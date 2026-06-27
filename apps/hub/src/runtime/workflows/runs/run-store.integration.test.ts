import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { get, reset, useTestBed } from '@brika/di/testing';
import { RunStore } from './run-store';

useTestBed({ autoStub: false });

describe('RunStore', () => {
  let store: RunStore;
  let tempDir: string;

  beforeEach(async () => {
    reset();
    tempDir = await mkdtemp(join(tmpdir(), 'run-store-test-'));
    configureDatabases(tempDir);
    store = get(RunStore);
    store.init();
  });

  afterEach(() => {
    store.close();
    reset();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('records a full run lifecycle as a completed run', () => {
    const correlationId = 'corr-1';
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId, blockId: 'trigger' });
    store.record({
      type: 'block.start',
      workflowId: 'wf',
      correlationId,
      blockId: 'b1',
      port: 'in',
    });
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId,
      blockId: 'b1',
      port: 'out',
      data: { ok: true },
    });
    store.record({ type: 'run.closed', workflowId: 'wf', correlationId });

    const { runs } = store.query();
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe('completed');
    expect(runs[0]?.workflowId).toBe('wf');
    expect(runs[0]?.triggerBlockId).toBe('trigger');
    expect(runs[0]?.finishedAt).toBeDefined();
    expect(runs[0]?.eventCount).toBe(2);

    const detail = store.get(Number(runs[0]?.id));
    expect(detail?.events.length).toBe(2);
    expect(detail?.events[0]?.kind).toBe('block.start');
    expect(detail?.events[1]?.kind).toBe('block.emit');
    expect(detail?.events[1]?.data).toEqual({ ok: true });
  });

  test('a block.error flips the run to error and keeps the message', () => {
    const correlationId = 'corr-err';
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId, blockId: 't' });
    store.record({
      type: 'block.error',
      workflowId: 'wf',
      correlationId,
      blockId: 'b1',
      error: 'boom',
    });
    store.record({ type: 'run.closed', workflowId: 'wf', correlationId });

    const { runs } = store.query();
    expect(runs[0]?.status).toBe('error');
    expect(runs[0]?.error).toBe('boom');
  });

  test('query filters by workflowId and status', () => {
    store.record({ type: 'run.opened', workflowId: 'a', correlationId: 'c-a', blockId: 't' });
    store.record({ type: 'run.closed', workflowId: 'a', correlationId: 'c-a' });
    store.record({ type: 'run.opened', workflowId: 'b', correlationId: 'c-b', blockId: 't' });

    expect(store.query({ workflowId: 'a' }).runs.length).toBe(1);
    expect(store.query({ status: 'completed' }).runs.length).toBe(1);
    const running = store.query({ status: 'running' }).runs;
    expect(running.length).toBe(1);
    expect(running[0]?.workflowId).toBe('b');
  });

  test('workflow.stopped finalizes runs still open', () => {
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId: 'open-1', blockId: 't' });
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId: 'open-1',
      blockId: 'b',
      port: 'out',
      data: 1,
    });
    store.record({ type: 'workflow.stopped', workflowId: 'wf' });

    const { runs } = store.query();
    expect(runs[0]?.status).toBe('completed');
    expect(runs[0]?.finishedAt).toBeDefined();
  });

  test('oversized event data is truncated to a marker', () => {
    const correlationId = 'big';
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId, blockId: 't' });
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId,
      blockId: 'b',
      port: 'out',
      data: 'x'.repeat(20000),
    });

    const { runs } = store.query();
    const detail = store.get(Number(runs[0]?.id));
    expect(detail?.events[0]?.data).toMatchObject({ __truncated: true });
  });

  test('lazily opens a run for a run-scoped event arriving without run.opened', () => {
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId: 'orphan',
      blockId: 'b',
      port: 'out',
      data: 1,
    });

    const { runs } = store.query();
    expect(runs.length).toBe(1);
    expect(runs[0]?.status).toBe('running');
    expect(runs[0]?.eventCount).toBe(1);
  });
});

describe('RunStore.recentEmittedValues', () => {
  let store: RunStore;
  let tempDir: string;

  beforeEach(async () => {
    reset();
    tempDir = await mkdtemp(join(tmpdir(), 'run-store-history-'));
    configureDatabases(tempDir);
    store = get(RunStore);
    store.init();
  });

  afterEach(() => {
    store.close();
    reset();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('lists previous values from the wired sources, newest first, deduped', () => {
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId: 'c1', blockId: 'src' });
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId: 'c1',
      blockId: 'src',
      port: 'out',
      data: { n: 1 },
    });
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId: 'c1',
      blockId: 'src',
      port: 'out',
      data: { n: 2 },
    });
    // Duplicate payload: deduped, keeps the newest occurrence position
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId: 'c1',
      blockId: 'src',
      port: 'out',
      data: { n: 1 },
    });
    // Different port: not wired into the target input, must be excluded
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId: 'c1',
      blockId: 'src',
      port: 'other',
      data: { n: 99 },
    });

    const values = store.recentEmittedValues('wf', [{ blockId: 'src', port: 'out' }], 10);
    expect(values.map((v) => v.value)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  test('empty refs and unknown workflows return nothing', () => {
    expect(store.recentEmittedValues('wf', [], 10)).toEqual([]);
    expect(store.recentEmittedValues('ghost', [{ blockId: 'a', port: 'out' }], 10)).toEqual([]);
  });

  test('pruneOlderThan deletes runs AND their events past the cutoff', () => {
    const correlationId = 'corr-old';
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId, blockId: 't' });
    store.record({
      type: 'block.start',
      workflowId: 'wf',
      correlationId,
      blockId: 'b1',
      port: 'in',
    });
    store.record({ type: 'run.closed', workflowId: 'wf', correlationId });

    const before = store.query();
    expect(before.runs).toHaveLength(1);
    const runId = Number(before.runs[0]?.id);
    expect(store.get(runId)?.events.length).toBe(1);

    // Cutoff in the future deletes the just-created run (startedAt < cutoff).
    const removed = store.pruneOlderThan(Date.now() + 10_000);
    expect(removed).toBe(1);

    // Both the run and its events are gone (no orphaned run_events).
    expect(store.query().runs).toHaveLength(0);
    expect(store.get(runId)).toBeNull();
  });

  test('pruneOlderThan keeps runs newer than the cutoff', () => {
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId: 'keep', blockId: 't' });
    store.record({ type: 'run.closed', workflowId: 'wf', correlationId: 'keep' });

    // Cutoff far in the past removes nothing.
    expect(store.pruneOlderThan(1)).toBe(0);
    expect(store.query().runs).toHaveLength(1);
  });

  test('pruneOlderThan never prunes a still-running run (no orphaned events)', () => {
    const correlationId = 'still-open';
    // Opened but never closed: status stays 'running' and its correlationId is
    // still live, so even an old startedAt must NOT be pruned.
    store.record({ type: 'run.opened', workflowId: 'wf', correlationId, blockId: 't' });
    store.record({
      type: 'block.start',
      workflowId: 'wf',
      correlationId,
      blockId: 'b1',
      port: 'in',
    });

    // A cutoff in the future would match by startedAt, but the status filter spares it.
    expect(store.pruneOlderThan(Date.now() + 10_000)).toBe(0);

    const runs = store.query().runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('running');
    // A later event for the still-open run still lands on a live row, not an orphan.
    store.record({
      type: 'block.emit',
      workflowId: 'wf',
      correlationId,
      blockId: 'b1',
      port: 'out',
      data: { ok: true },
    });
    expect(store.get(Number(runs[0]?.id))?.events.length).toBe(2);
  });
});
