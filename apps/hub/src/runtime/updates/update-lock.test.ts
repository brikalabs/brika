/**
 * UpdateLock tests.
 *
 * Cross-process semantics are validated via a fresh lock file each
 * test. We can't easily fork another Bun process in a unit test, but
 * two `UpdateLock` instances pointing at the same path simulate the
 * same race.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateLock, UpdateLockHeldError } from './update-lock';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-lock-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('UpdateLock', () => {
  test('acquire creates the lock file with current process metadata', () => {
    const lock = new UpdateLock(tmp);
    lock.acquire();
    expect(lock.isHeld()).toBe(true);
    expect(existsSync(lock.path)).toBe(true);
    lock.release();
  });

  test('release removes the lock file', () => {
    const lock = new UpdateLock(tmp);
    lock.acquire();
    lock.release();
    expect(lock.isHeld()).toBe(false);
  });

  test('second acquire throws UpdateLockHeldError with holder metadata', () => {
    const a = new UpdateLock(tmp);
    const b = new UpdateLock(tmp);
    a.acquire();
    try {
      expect(() => b.acquire()).toThrow(UpdateLockHeldError);
    } finally {
      a.release();
    }
  });

  test('UpdateLockHeldError exposes pid + startedAt of the holder', () => {
    const a = new UpdateLock(tmp);
    const b = new UpdateLock(tmp);
    a.acquire();
    try {
      b.acquire();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UpdateLockHeldError);
      const held = (err as UpdateLockHeldError).heldBy;
      expect(held).not.toBeNull();
      expect(held?.pid).toBe(process.pid);
      expect(typeof held?.startedAt).toBe('string');
    } finally {
      a.release();
    }
  });

  test('stale lock (older than 30 min) is broken and re-acquired', () => {
    const lockPath = join(tmp, '.update.lock');
    const aLongTimeAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    writeFileSync(lockPath, `${JSON.stringify({ pid: 999999, startedAt: aLongTimeAgo })}\n`);
    const fresh = new UpdateLock(tmp);
    fresh.acquire();
    expect(fresh.isHeld()).toBe(true);
    fresh.release();
  });

  test('lock with unparseable contents is treated as held (no metadata)', () => {
    writeFileSync(join(tmp, '.update.lock'), 'garbage');
    const lock = new UpdateLock(tmp);
    try {
      lock.acquire();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UpdateLockHeldError);
      expect((err as UpdateLockHeldError).heldBy).toBeNull();
    }
  });

  test('acquire after release works (no orphan fd state)', () => {
    const lock = new UpdateLock(tmp);
    lock.acquire();
    lock.release();
    lock.acquire();
    expect(lock.isHeld()).toBe(true);
    lock.release();
  });

  test('release() does NOT delete a lock that was stolen by a stale-break', () => {
    // A held the lock, then a long pause (real or simulated via clock
    // manipulation in production) made A's lock stale. B broke it and
    // acquired fresh. When A finally calls release(), it must NOT
    // unlink B's lock file.
    const a = new UpdateLock(tmp);
    a.acquire();
    // Simulate stale-break by overwriting the lock file with someone
    // else's metadata while A still thinks it owns it.
    writeFileSync(
      join(tmp, '.update.lock'),
      `${JSON.stringify({ pid: 99999, startedAt: '2099-01-01T00:00:00.000Z' })}\n`
    );

    a.release();

    // B's lock file must still be present.
    expect(existsSync(join(tmp, '.update.lock'))).toBe(true);
  });

  test('peekHolder() returns metadata without acquiring', () => {
    const a = new UpdateLock(tmp);
    a.acquire();
    try {
      const b = new UpdateLock(tmp);
      const held = b.peekHolder();
      expect(held).not.toBeNull();
      expect(held?.pid).toBe(process.pid);
      // peek doesn't change held state
      expect(b.isHeld()).toBe(true);
    } finally {
      a.release();
    }
    expect(new UpdateLock(tmp).peekHolder()).toBeNull();
  });
});
