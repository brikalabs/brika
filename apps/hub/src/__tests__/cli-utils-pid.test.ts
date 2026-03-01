/**
 * Tests for CLI PID utilities: readPid, checkPid, claimPidFile,
 * removePidFile, and isErrnoException.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  checkPid,
  claimPidFile,
  isErrnoException,
  PID_FILE,
  readPid,
  removePidFile,
} from '@/cli/utils/pid';

const pidDir = dirname(PID_FILE);

describe('cli/utils/pid', () => {
  beforeEach(async () => {
    await rm(PID_FILE, {
      force: true,
    });
  });

  afterEach(async () => {
    await rm(PID_FILE, {
      force: true,
    });
  });

  // ─── readPid ────────────────────────────────────────────────────────────────

  describe('readPid', () => {
    test('returns null when no pid file exists', async () => {
      expect(await readPid()).toBeNull();
    });

    test('returns the pid as a number', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      await writeFile(PID_FILE, '12345');
      expect(await readPid()).toBe(12345);
    });

    test('returns null for non-numeric content', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      await writeFile(PID_FILE, 'not-a-pid');
      expect(await readPid()).toBeNull();
    });

    test('returns null for empty file', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      await writeFile(PID_FILE, '');
      expect(await readPid()).toBeNull();
    });
  });

  // ─── checkPid ───────────────────────────────────────────────────────────────

  describe('checkPid', () => {
    test('returns stopped when no pid file exists', async () => {
      const status = await checkPid();
      expect(status).toEqual({
        state: 'stopped',
      });
    });

    test('returns running for current process pid', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      await writeFile(PID_FILE, String(process.pid));
      const status = await checkPid();
      expect(status).toEqual({
        state: 'running',
        pid: process.pid,
      });
    });

    test('returns stale for non-existent process pid', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      // Use a very high PID that is almost certainly not running
      await writeFile(PID_FILE, '999999');
      const status = await checkPid();
      expect(status).toEqual({
        state: 'stale',
        pid: 999999,
      });
    });
  });

  // ─── claimPidFile ──────────────────────────────────────────────────────────

  describe('claimPidFile', () => {
    test('returns null and writes current pid when no prior process', async () => {
      const result = await claimPidFile();
      expect(result).toBeNull();
      const written = await readFile(PID_FILE, 'utf8');
      expect(written).toBe(String(process.pid));
    });

    test('returns existing pid when hub is already running', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      // Write our own PID to simulate a running process
      await writeFile(PID_FILE, String(process.pid));
      const result = await claimPidFile();
      expect(result).toBe(process.pid);
    });

    test('removes stale pid file and claims for current process', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      // Write a PID that does not correspond to a running process
      await writeFile(PID_FILE, '999999');
      const result = await claimPidFile();
      expect(result).toBeNull();
      const written = await readFile(PID_FILE, 'utf8');
      expect(written).toBe(String(process.pid));
    });
  });

  // ─── removePidFile ─────────────────────────────────────────────────────────

  describe('removePidFile', () => {
    test('does not throw when file does not exist', async () => {
      await expect(removePidFile()).resolves.toBeUndefined();
    });

    test('removes existing pid file', async () => {
      await mkdir(pidDir, {
        recursive: true,
      });
      await writeFile(PID_FILE, '12345');
      await removePidFile();
      const contents = await readFile(PID_FILE, 'utf8').catch(() => null);
      expect(contents).toBeNull();
    });
  });

  // ─── isErrnoException ──────────────────────────────────────────────────────

  describe('isErrnoException', () => {
    test('returns true for Error with code property', () => {
      const err = Object.assign(new Error('fail'), {
        code: 'ENOENT',
      });
      expect(isErrnoException(err)).toBe(true);
    });

    test('returns false for plain Error without code', () => {
      expect(isErrnoException(new Error('fail'))).toBe(false);
    });

    test('returns false for non-Error values', () => {
      expect(isErrnoException('string')).toBe(false);
      expect(isErrnoException(null)).toBe(false);
      expect(isErrnoException(undefined)).toBe(false);
      expect(
        isErrnoException({
          code: 'ENOENT',
        })
      ).toBe(false);
    });

    test('narrows type to access code property', () => {
      const err: unknown = Object.assign(new Error('fail'), {
        code: 'ESRCH',
      });
      if (isErrnoException(err)) {
        expect(err.code).toBe('ESRCH');
      }
    });
  });
});
