import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearRunState,
  readRunState,
  reapStaleRun,
  runStatePath,
  writeRunState,
} from './run-state';

function mkRoot(): string {
  return mkdtempSync(join(tmpdir(), 'mortar-run-state-'));
}

/** A dead PID with a valid range: spawn a no-op and wait for it to exit. */
async function deadPid(): Promise<number> {
  const proc = Bun.spawn(['bun', '-e', ''], { stdout: 'ignore', stderr: 'ignore' });
  await proc.exited;
  return proc.pid;
}

beforeEach(() => {
  // The polite-pass grace period is 3s in production; the reaper reads
  // this env per call, so tests don't sit through it.
  process.env.MORTAR_REAP_GRACE_MS = '50';
});

afterEach(() => {
  delete process.env.MORTAR_REAP_GRACE_MS;
});

describe('run-state file', () => {
  test('write → read roundtrip', () => {
    const root = mkRoot();
    writeRunState(root, {
      mortarPid: 1234,
      services: [{ id: 'hub', pid: 5678, command: 'bun --watch src/main.ts' }],
    });
    expect(readRunState(root)).toEqual({
      mortarPid: 1234,
      services: [{ id: 'hub', pid: 5678, command: 'bun --watch src/main.ts' }],
    });
  });

  test('clearRunState removes the file and is idempotent', () => {
    const root = mkRoot();
    writeRunState(root, { mortarPid: 1, services: [] });
    clearRunState(root);
    clearRunState(root);
    expect(existsSync(runStatePath(root))).toBe(false);
    expect(readRunState(root)).toBeNull();
  });

  test('corrupt or shape-mismatched JSON reads as null', () => {
    const root = mkRoot();
    writeFileSync(runStatePath(root), '{not json');
    expect(readRunState(root)).toBeNull();
    writeFileSync(runStatePath(root), JSON.stringify({ services: 'nope' }));
    expect(readRunState(root)).toBeNull();
  });

  test('malformed service entries are dropped, valid ones kept', () => {
    const root = mkRoot();
    writeFileSync(
      runStatePath(root),
      JSON.stringify({
        mortarPid: 1,
        services: [
          { id: 'ok', pid: 42, command: 'sleep 1' },
          { id: 'bad-pid', pid: 'x', command: 'sleep 1' },
          'not-an-object',
        ],
      })
    );
    expect(readRunState(root)?.services).toEqual([{ id: 'ok', pid: 42, command: 'sleep 1' }]);
  });
});

describe('reapStaleRun', () => {
  test('no state file → clean', async () => {
    expect(await reapStaleRun(mkRoot())).toEqual({ kind: 'clean' });
  });

  test('kills a recorded child whose owner mortar is dead', async () => {
    const root = mkRoot();
    const orphan = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
    writeRunState(root, {
      mortarPid: await deadPid(),
      services: [{ id: 'hub', pid: orphan.pid, command: 'sleep 30' }],
    });

    const result = await reapStaleRun(root);

    expect(result).toEqual({ kind: 'reaped', reaped: 1 });
    // Resolution of `exited` is the proof of death; the exact code is
    // signal-dependent (SIGTERM vs the SIGKILL fallback).
    await orphan.exited;
    expect(orphan.exitCode === 0).toBe(false);
    expect(existsSync(runStatePath(root))).toBe(false);
  });

  test('skips a live PID whose command no longer matches (PID reuse)', async () => {
    const root = mkRoot();
    const bystander = Bun.spawn(['sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
    writeRunState(root, {
      mortarPid: await deadPid(),
      services: [{ id: 'hub', pid: bystander.pid, command: 'bun --watch src/main.ts' }],
    });

    const result = await reapStaleRun(root);

    expect(result).toEqual({ kind: 'reaped', reaped: 0 });
    expect(bystander.exitCode).toBeNull();
    bystander.kill();
    await bystander.exited;
  });

  test('dead recorded children are ignored', async () => {
    const root = mkRoot();
    writeRunState(root, {
      mortarPid: await deadPid(),
      services: [{ id: 'hub', pid: await deadPid(), command: 'bun -e ""' }],
    });
    expect(await reapStaleRun(root)).toEqual({ kind: 'reaped', reaped: 0 });
  });

  test('reports a still-running mortar session as active', async () => {
    const root = mkRoot();
    // argv0 renames the process so its `ps` command line contains
    // "mortar", which is what the owner-liveness check keys on.
    const fakeMortar = Bun.spawn(['sleep', '30'], {
      argv0: 'fake-mortar',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    writeRunState(root, { mortarPid: fakeMortar.pid, services: [] });

    const result = await reapStaleRun(root);

    expect(result).toEqual({ kind: 'active', mortarPid: fakeMortar.pid });
    // An active session must keep its state file.
    expect(existsSync(runStatePath(root))).toBe(true);
    fakeMortar.kill();
    await fakeMortar.exited;
  });
});
