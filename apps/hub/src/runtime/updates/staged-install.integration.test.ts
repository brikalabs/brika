/**
 * Staged install tests — file-level operations exercised against
 * temp directories. Self-check spawning is covered indirectly by
 * `self-check.test.ts` (the probe itself) and by the orchestrator
 * tests (the failure-mode plumbing).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearPreviousBackup,
  commitStagedArtifacts,
  discardStagedArtifacts,
  hasPreviousBackup,
  liveBinaryPath,
  nextBinaryPath,
  previousBinaryPath,
  stageArtifacts,
} from './staged-install';

let installDir: string;
let sourceDir: string;

beforeEach(() => {
  installDir = mkdtempSync(join(tmpdir(), 'brika-stage-install-'));
  sourceDir = mkdtempSync(join(tmpdir(), 'brika-stage-source-'));
});

afterEach(() => {
  rmSync(installDir, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

const BINARY_NAME = process.platform === 'win32' ? 'brika.exe' : 'brika';

function writeSourceBinary(content: string): void {
  writeFileSync(join(sourceDir, BINARY_NAME), content);
}

function writeSourceUi(): void {
  mkdirSync(join(sourceDir, 'ui'), { recursive: true });
  writeFileSync(join(sourceDir, 'ui', 'index.html'), '<html></html>');
}

describe('stageArtifacts', () => {
  test('copies binary to brika.next and preserves contents', async () => {
    writeSourceBinary('new-binary-bytes');
    const { stagedBinary } = await stageArtifacts({ sourceDir, installDir });
    expect(stagedBinary).toBe(nextBinaryPath(installDir));
    expect(readFileSync(stagedBinary, 'utf8')).toBe('new-binary-bytes');
  });

  test('copies ui/ to ui.next when present in source', async () => {
    writeSourceBinary('x');
    writeSourceUi();
    await stageArtifacts({ sourceDir, installDir });
    expect(existsSync(join(installDir, 'ui.next', 'index.html'))).toBe(true);
  });

  test('throws when source archive is missing the binary', async () => {
    writeSourceUi(); // ui but no binary
    await expect(stageArtifacts({ sourceDir, installDir })).rejects.toThrow(
      /Source archive missing/
    );
  });

  test('overwrites a stale .next from a previous failed attempt', async () => {
    writeFileSync(nextBinaryPath(installDir), 'stale');
    writeSourceBinary('fresh');
    await stageArtifacts({ sourceDir, installDir });
    expect(readFileSync(nextBinaryPath(installDir), 'utf8')).toBe('fresh');
  });

  test('rejects a relative installDir whose path survives normalisation with `..`', async () => {
    // `path.normalize` collapses interior `..` segments, so the
    // rename-sink guard only fires on payloads that retain a literal
    // `..` after normalisation — i.e. a relative path that traverses
    // upwards from cwd. The realistic-production installDir is always
    // an absolute `dirname(process.execPath)`; this test pins the
    // defence-in-depth backstop so a future caller passing relative
    // strings is caught at the rename sink rather than silently
    // writing outside the intended root.
    writeSourceBinary('payload');
    await expect(stageArtifacts({ sourceDir, installDir: '../escape' })).rejects.toThrow(
      /escapes installDir|relative segment/
    );
  });
});

describe('commitStagedArtifacts', () => {
  test('renames live → previous and next → live atomically', () => {
    writeFileSync(liveBinaryPath(installDir), 'old');
    writeFileSync(nextBinaryPath(installDir), 'new');
    commitStagedArtifacts(installDir);
    expect(readFileSync(liveBinaryPath(installDir), 'utf8')).toBe('new');
    expect(readFileSync(previousBinaryPath(installDir), 'utf8')).toBe('old');
    expect(existsSync(nextBinaryPath(installDir))).toBe(false);
  });

  test('clears any stale .previous from a prior upgrade before swapping', () => {
    writeFileSync(liveBinaryPath(installDir), 'v2');
    writeFileSync(previousBinaryPath(installDir), 'v0-stale');
    writeFileSync(nextBinaryPath(installDir), 'v3');
    commitStagedArtifacts(installDir);
    expect(readFileSync(previousBinaryPath(installDir), 'utf8')).toBe('v2');
  });
});

describe('discardStagedArtifacts', () => {
  test('removes brika.next, its .tmp, and ui.next', () => {
    writeFileSync(nextBinaryPath(installDir), 'staged');
    writeFileSync(`${nextBinaryPath(installDir)}.tmp`, 'partial');
    mkdirSync(join(installDir, 'ui.next'), { recursive: true });
    writeFileSync(join(installDir, 'ui.next', 'x.html'), 'x');
    discardStagedArtifacts(installDir);
    expect(existsSync(nextBinaryPath(installDir))).toBe(false);
    expect(existsSync(`${nextBinaryPath(installDir)}.tmp`)).toBe(false);
    expect(existsSync(join(installDir, 'ui.next'))).toBe(false);
  });

  test('safe to call when nothing is staged', () => {
    expect(() => discardStagedArtifacts(installDir)).not.toThrow();
  });
});

describe('clearPreviousBackup + hasPreviousBackup', () => {
  test('hasPreviousBackup reflects on-disk presence', () => {
    expect(hasPreviousBackup(installDir)).toBe(false);
    writeFileSync(previousBinaryPath(installDir), 'old');
    expect(hasPreviousBackup(installDir)).toBe(true);
  });

  test('clearPreviousBackup removes the binary backup and ui.previous', () => {
    writeFileSync(previousBinaryPath(installDir), 'old');
    mkdirSync(join(installDir, 'ui.previous'), { recursive: true });
    writeFileSync(join(installDir, 'ui.previous', 'x.html'), 'x');
    clearPreviousBackup(installDir);
    expect(existsSync(previousBinaryPath(installDir))).toBe(false);
    expect(existsSync(join(installDir, 'ui.previous'))).toBe(false);
  });
});
