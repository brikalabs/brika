/**
 * Unit tests for the `.git/HEAD` reader the build-info macro uses.
 *
 * We test the lock-free path against a temp `.git` layout instead of
 * spawning git or relying on the repo's real HEAD — the latter would
 * make assertions wobble on every commit and tell us nothing about the
 * resolver's behaviour against pathological inputs.
 *
 * Each test owns its own fixture directory; teardown drops it after.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getBrikaVersion,
  getBuildDate,
  getGitBranch,
  getGitCommit,
  getGitCommitFull,
  isFullSha,
  resolveHeadAt,
  resolveRef,
} from '@/build-info.macro';

const FAKE_SHA = 'a'.repeat(40);
const ANOTHER_SHA = 'b'.repeat(40);

describe('isFullSha', () => {
  test('accepts 40 lowercase hex chars', () => {
    expect(isFullSha(FAKE_SHA)).toBe(true);
    expect(isFullSha('0123456789abcdef0123456789abcdef01234567')).toBe(true);
  });

  test('rejects wrong length', () => {
    expect(isFullSha('')).toBe(false);
    expect(isFullSha('abc1234')).toBe(false);
    expect(isFullSha(`${FAKE_SHA}0`)).toBe(false);
  });

  test('rejects uppercase or non-hex characters', () => {
    expect(isFullSha('A'.repeat(40))).toBe(false);
    expect(isFullSha(`${'a'.repeat(39)}g`)).toBe(false);
    expect(isFullSha(`${'a'.repeat(39)}!`)).toBe(false);
  });
});

describe('resolveHeadAt + resolveRef', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'brika-buildinfo-'));
  });

  afterEach(() => {
    rmSync(gitDir, { recursive: true, force: true });
  });

  test('follows `ref: refs/heads/<branch>` through a loose ref file', () => {
    mkdirSync(join(gitDir, 'refs/heads'), { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(gitDir, 'refs/heads/main'), `${FAKE_SHA}\n`);

    expect(resolveHeadAt(gitDir)).toEqual({ branch: 'main', commit: FAKE_SHA });
  });

  test('strips trailing newline + whitespace from both HEAD and the loose ref', () => {
    mkdirSync(join(gitDir, 'refs/heads'), { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), '  ref: refs/heads/develop  \n');
    writeFileSync(join(gitDir, 'refs/heads/develop'), `  ${FAKE_SHA}  \n`);

    // HEAD itself is trimmed; the `ref: ` slice + ref-name lookup tolerates
    // surrounding whitespace because git itself does.
    const result = resolveHeadAt(gitDir);
    expect(result.commit).toBe(FAKE_SHA);
  });

  test('falls back to packed-refs when the loose ref is missing', () => {
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(
      join(gitDir, 'packed-refs'),
      [
        '# pack-refs with: peeled fully-peeled sorted',
        `${FAKE_SHA} refs/heads/main`,
        `${ANOTHER_SHA} refs/heads/feature`,
        '^somepeeledcommit', // peeled-tag line — must be skipped
        '',
      ].join('\n')
    );

    expect(resolveHeadAt(gitDir)).toEqual({ branch: 'main', commit: FAKE_SHA });
  });

  test('returns commit=unknown when the ref exists in neither loose nor packed', () => {
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/nope\n');
    writeFileSync(join(gitDir, 'packed-refs'), `${FAKE_SHA} refs/heads/other\n`);

    expect(resolveHeadAt(gitDir)).toEqual({ branch: 'nope', commit: 'unknown' });
  });

  test('treats detached HEAD (40-char SHA) as branch=HEAD', () => {
    writeFileSync(join(gitDir, 'HEAD'), `${FAKE_SHA}\n`);

    expect(resolveHeadAt(gitDir)).toEqual({ branch: 'HEAD', commit: FAKE_SHA });
  });

  test('returns {unknown, unknown} for garbage in HEAD', () => {
    writeFileSync(join(gitDir, 'HEAD'), 'this is not a ref\n');

    expect(resolveHeadAt(gitDir)).toEqual({ branch: 'unknown', commit: 'unknown' });
  });

  test('returns {unknown, unknown} when HEAD is missing entirely', () => {
    // Empty gitDir — no HEAD file. readFileSync throws, caught.
    expect(resolveHeadAt(gitDir)).toEqual({ branch: 'unknown', commit: 'unknown' });
  });

  test('handles a non-branch ref by keeping the ref name as the branch', () => {
    // A ref that isn't under refs/heads/ — e.g. mid-rebase HEAD pointing at
    // a worktree-internal ref. The slice should leave the full ref as-is
    // and still try to resolve it.
    mkdirSync(join(gitDir, 'refs/something'), { recursive: true });
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/something/odd\n');
    writeFileSync(join(gitDir, 'refs/something/odd'), `${FAKE_SHA}\n`);

    expect(resolveHeadAt(gitDir)).toEqual({
      branch: 'refs/something/odd',
      commit: FAKE_SHA,
    });
  });

  test('packed-refs: ignores comment lines and peeled-tag lines', () => {
    // Even if there's a `^...` line right above our target, it must not be
    // mistaken for the target's SHA.
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(
      join(gitDir, 'packed-refs'),
      [
        '# pack-refs with: peeled fully-peeled sorted',
        '# another comment',
        `${ANOTHER_SHA} refs/tags/v1.0.0`,
        '^peeledcommitsha1234567890abcdef1234567890', // peeled tag, must skip
        `${FAKE_SHA} refs/heads/main`,
        '',
      ].join('\n')
    );

    expect(resolveHeadAt(gitDir).commit).toBe(FAKE_SHA);
  });
});

describe('resolveRef', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'brika-buildinfo-ref-'));
  });

  afterEach(() => {
    rmSync(gitDir, { recursive: true, force: true });
  });

  test('returns unknown when neither loose nor packed-refs exist', () => {
    expect(resolveRef(gitDir, 'refs/heads/main')).toBe('unknown');
  });

  test('prefers the loose ref file over packed-refs', () => {
    mkdirSync(join(gitDir, 'refs/heads'), { recursive: true });
    writeFileSync(join(gitDir, 'refs/heads/main'), `${FAKE_SHA}\n`);
    // packed-refs has a different SHA for the same ref — loose wins.
    writeFileSync(join(gitDir, 'packed-refs'), `${ANOTHER_SHA} refs/heads/main\n`);

    expect(resolveRef(gitDir, 'refs/heads/main')).toBe(FAKE_SHA);
  });
});

/**
 * The public macro entry points all go through `resolveHead()` →
 * `findGitDir()`. Calling them from a test running anywhere inside the
 * repo exercises that path against the real `.git` and returns the
 * current HEAD — we assert only on shape, not the actual SHA, so the
 * tests don't break on every commit.
 */
describe('public macro entry points', () => {
  test('getGitCommit returns a short SHA or "unknown"', () => {
    const c = getGitCommit();
    if (c !== 'unknown') {
      expect(c).toMatch(/^[0-9a-f]{7}$/);
    }
  });

  test('getGitCommitFull returns a 40-char SHA or "unknown"', () => {
    const c = getGitCommitFull();
    if (c !== 'unknown') {
      expect(isFullSha(c)).toBe(true);
    }
  });

  test('getGitBranch returns a non-empty string', () => {
    const b = getGitBranch();
    expect(b.length).toBeGreaterThan(0);
  });

  test('getBuildDate returns an ISO timestamp', () => {
    const d = getBuildDate();
    // Standard ISO 8601 like 2026-05-28T14:30:00.000Z. The macro returns
    // a fresh `new Date().toISOString()` per call, so we don't pin the
    // value — just the shape.
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('getBrikaVersion', () => {
  // Save/restore so the env mutation doesn't leak into sibling tests.
  const original = process.env.BRIKA_VERSION;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.BRIKA_VERSION;
    } else {
      process.env.BRIKA_VERSION = original;
    }
  });

  test('prefers BRIKA_VERSION when set', () => {
    process.env.BRIKA_VERSION = '9.9.9-test';
    expect(getBrikaVersion()).toBe('9.9.9-test');
  });

  test('trims surrounding whitespace from the env value', () => {
    process.env.BRIKA_VERSION = '  1.2.3  ';
    expect(getBrikaVersion()).toBe('1.2.3');
  });

  test('treats an empty env var as unset and falls back to package.json', () => {
    process.env.BRIKA_VERSION = '   ';
    const v = getBrikaVersion();
    expect(v.length).toBeGreaterThan(0);
    expect(v).not.toBe('   ');
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('falls back to a semver-shaped string from package.json when unset', () => {
    delete process.env.BRIKA_VERSION;
    expect(getBrikaVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
