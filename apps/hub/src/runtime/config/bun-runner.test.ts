/**
 * Tests for BunRunner
 */

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { BunRunner } from '@/runtime/config';

describe('BunRunner', () => {
  const bun = useBunMock();

  describe('bin', () => {
    test('defaults to process.execPath', () => {
      bun.apply();
      const runner = new BunRunner();
      expect(runner.bin).toBe(process.execPath);
    });

    test('uses BRIKA_BUN_PATH when set', () => {
      bun.apply();
      const original = process.env.BRIKA_BUN_PATH;
      process.env.BRIKA_BUN_PATH = '/custom/bun';
      try {
        const runner = new BunRunner();
        expect(runner.bin).toBe('/custom/bun');
      } finally {
        if (original === undefined) {
          delete process.env.BRIKA_BUN_PATH;
        } else {
          process.env.BRIKA_BUN_PATH = original;
        }
      }
    });
  });

  describe('env()', () => {
    test('always sets BUN_BE_BUN=1 for consistent runtime behavior', () => {
      bun.apply();
      const runner = new BunRunner();
      const env = runner.env();
      expect(env.BUN_BE_BUN).toBe('1');
    });

    test('merges extra entries on top', () => {
      bun.apply();
      const runner = new BunRunner();
      const env = runner.env({
        MY_VAR: 'hello',
      });
      expect(env.MY_VAR).toBe('hello');
    });

    test('extra entries override base env', () => {
      bun.apply();
      const runner = new BunRunner();
      const env = runner.env({
        PATH: '/custom',
      });
      expect(env.PATH).toBe('/custom');
    });

    test('returns base env unchanged when no extra given', () => {
      bun.apply();
      const runner = new BunRunner();
      const a = runner.env();
      const b = runner.env(undefined);
      expect(a).toEqual(b);
    });
  });

  describe('spawn()', () => {
    test('prepends bin to args', () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();
      const runner = new BunRunner();
      runner.spawn(['install', 'pkg']);
      expect(bun.spawnCalls[0]?.cmd).toEqual([process.execPath, 'install', 'pkg']);
    });

    test('uses pluginsDir as cwd when passed', () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();
      const runner = new BunRunner();
      runner.spawn(['install'], {
        cwd: '/my/dir',
      });
      const opts = bun.spawnCalls[0]?.options as Record<string, unknown>;
      expect(opts?.cwd).toBe('/my/dir');
    });

    test('merges extra env into spawn call', () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();
      const runner = new BunRunner();
      runner.spawn(['install'], {
        env: {
          MY_VAR: 'test',
        },
      });
      const opts = bun.spawnCalls[0]?.options as Record<string, unknown>;
      const env = opts?.env as Record<string, string>;
      expect(env?.MY_VAR).toBe('test');
    });

    test('passes stdout/stderr options through', () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();
      const runner = new BunRunner();
      runner.spawn(['run', 'script'], {
        stdout: 'pipe',
        stderr: 'ignore',
      });
      const opts = bun.spawnCalls[0]?.options as Record<string, unknown>;
      expect(opts?.stdout).toBe('pipe');
      expect(opts?.stderr).toBe('ignore');
    });
  });
});
