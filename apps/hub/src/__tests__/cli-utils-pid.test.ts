/**
 * Tests for CLI PID utilities
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isErrnoException, PID_FILE, readPid } from '@/cli/utils/pid';

describe('cli/utils/pid', () => {
  describe('readPid', () => {
    const pidDir = dirname(PID_FILE);

    beforeEach(async () => {
      await rm(PID_FILE, { force: true });
    });

    afterEach(async () => {
      await rm(PID_FILE, { force: true });
    });

    test('returns null when no pid file exists', async () => {
      expect(await readPid()).toBeNull();
    });

    test('returns the pid as a number', async () => {
      await mkdir(pidDir, { recursive: true });
      await writeFile(PID_FILE, '12345');
      expect(await readPid()).toBe(12345);
    });

    test('returns null for non-numeric content', async () => {
      await mkdir(pidDir, { recursive: true });
      await writeFile(PID_FILE, 'not-a-pid');
      expect(await readPid()).toBeNull();
    });

    test('returns null for empty file', async () => {
      await mkdir(pidDir, { recursive: true });
      await writeFile(PID_FILE, '');
      expect(await readPid()).toBeNull();
    });
  });

  describe('isErrnoException', () => {
    test('returns true for Error with code property', () => {
      const err = Object.assign(new Error('fail'), { code: 'ENOENT' });
      expect(isErrnoException(err)).toBe(true);
    });

    test('returns false for plain Error without code', () => {
      expect(isErrnoException(new Error('fail'))).toBe(false);
    });

    test('returns false for non-Error values', () => {
      expect(isErrnoException('string')).toBe(false);
      expect(isErrnoException(null)).toBe(false);
      expect(isErrnoException(undefined)).toBe(false);
      expect(isErrnoException({ code: 'ENOENT' })).toBe(false);
    });

    test('narrows type to access code property', () => {
      const err: unknown = Object.assign(new Error('fail'), { code: 'ESRCH' });
      if (isErrnoException(err)) {
        expect(err.code).toBe('ESRCH');
      }
    });
  });
});
