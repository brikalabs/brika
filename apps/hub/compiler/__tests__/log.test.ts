/**
 * Tests for compiler log utilities
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { elapsed, fileSize } from '../log';

describe('fileSize', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-log-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('returns size in KB for files under 1 MB', async () => {
    const path = join(tmpDir, 'small.bin');
    await writeFile(path, Buffer.alloc(2048)); // 2 KB
    const result = await fileSize(path);
    expect(result).toBe('2.0 KB');
  });

  test('returns size in MB for files over 1 MB', async () => {
    const path = join(tmpDir, 'large.bin');
    await writeFile(path, Buffer.alloc(1024 * 1024 * 2)); // 2 MB
    const result = await fileSize(path);
    expect(result).toBe('2.0 MB');
  });

  test('returns 0.0 KB for missing file', async () => {
    const result = await fileSize(join(tmpDir, 'nonexistent.bin'));
    expect(result).toBe('0.0 KB');
  });
});

describe('elapsed', () => {
  test('returns a string ending in ms or s', () => {
    const result = elapsed();
    expect(result).toMatch(/^\d+(\.\d+)?(ms|s)$/);
  });

  test('returns ms suffix for short durations', () => {
    // elapsed() measures from module load — it should be < 1s in tests
    const result = elapsed();
    expect(result).toMatch(/ms$/);
  });
});
