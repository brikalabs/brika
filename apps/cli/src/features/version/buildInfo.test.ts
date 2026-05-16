/**
 * Drives `readBuildInfo` against fixture `.git/` trees under a tmpdir.
 * Each test owns its own cwd and restores `process.cwd()` in `afterEach`
 * so a failure can't leak the test process into a deleted directory.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMPTY_BUILD_INFO, readBuildInfo } from './buildInfo';

const FULL_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9001020304';

describe('readBuildInfo', () => {
  let root: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'brika-buildinfo-'));
    process.chdir(root);
  });

  afterEach(() => {
    // Restore cwd *before* removing the tmpdir so the test runner
    // never finds itself inside a missing directory.
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  });

  test('returns EMPTY_BUILD_INFO when no .git/ exists', () => {
    expect(readBuildInfo()).toEqual(EMPTY_BUILD_INFO);
  });

  test('returns EMPTY_BUILD_INFO when .git/HEAD is unreadable', () => {
    mkdirSync(join(root, '.git'));
    expect(readBuildInfo()).toEqual(EMPTY_BUILD_INFO);
  });

  test('reads loose ref HEAD into { branch, commit }', () => {
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), `${FULL_SHA}\n`, 'utf8');
    expect(readBuildInfo()).toEqual({
      branch: 'main',
      commit: FULL_SHA.slice(0, 7),
      commitDate: null,
    });
  });

  test('detached HEAD: HEAD is the sha → branch null, short commit', () => {
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'HEAD'), `${FULL_SHA}\n`, 'utf8');
    expect(readBuildInfo()).toEqual({
      branch: null,
      commit: FULL_SHA.slice(0, 7),
      commitDate: null,
    });
  });

  test('falls back to packed-refs when the loose ref file is missing', () => {
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/feature\n', 'utf8');
    writeFileSync(
      join(root, '.git', 'packed-refs'),
      [
        '# pack-refs with: peeled fully-peeled sorted',
        `${FULL_SHA} refs/heads/feature`,
        '^deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/other',
        '',
      ].join('\n'),
      'utf8'
    );
    expect(readBuildInfo()).toEqual({
      branch: 'feature',
      commit: FULL_SHA.slice(0, 7),
      commitDate: null,
    });
  });

  test('returns commit null when neither loose nor packed ref resolves', () => {
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/orphan\n', 'utf8');
    writeFileSync(
      join(root, '.git', 'packed-refs'),
      ['# header only', 'malformed-line-without-space'].join('\n'),
      'utf8'
    );
    expect(readBuildInfo()).toEqual({
      branch: 'orphan',
      commit: null,
      commitDate: null,
    });
  });

  test('non-branch ref (tag) yields a null branch but resolves the sha', () => {
    mkdirSync(join(root, '.git', 'refs', 'tags'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/tags/v1\n', 'utf8');
    writeFileSync(join(root, '.git', 'refs', 'tags', 'v1'), `${FULL_SHA}\n`, 'utf8');
    expect(readBuildInfo()).toEqual({
      branch: null,
      commit: FULL_SHA.slice(0, 7),
      commitDate: null,
    });
  });
});
