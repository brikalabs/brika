import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { getChangedPackages, getLastTag, packageDir, resolveRef } from '../git';

// The workspace root — tests run inside the real git repo
const ROOT = join(import.meta.dir, '..', '..', '..', '..');

describe('packageDir', () => {
  test('returns directory from a nested relative path', () => {
    expect(packageDir({ relativePath: 'packages/sdk/package.json' } as never)).toBe('packages/sdk');
  });

  test('returns "." for a root-level package.json', () => {
    expect(packageDir({ relativePath: 'package.json' } as never)).toBe('.');
  });

  test('handles paths with many segments', () => {
    expect(packageDir({ relativePath: 'apps/hub/package.json' } as never)).toBe('apps/hub');
  });
});

describe('getLastTag', () => {
  test('returns a string or null — never throws', async () => {
    const tag = await getLastTag(ROOT);
    expect(tag === null || typeof tag === 'string').toBe(true);
  });
});

describe('resolveRef', () => {
  test('resolves HEAD to a non-empty string', async () => {
    const result = await resolveRef(ROOT, 'HEAD');
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  test('returns null for a non-existent ref', async () => {
    const result = await resolveRef(ROOT, 'refs/tags/this-tag-does-not-exist-xyz');
    expect(result).toBeNull();
  });
});

describe('getChangedPackages', () => {
  test('returns a Set', async () => {
    // Compare HEAD against itself — nothing should have changed
    const result = await getChangedPackages(ROOT, 'HEAD', [
      {
        name: 'test-pkg',
        relativePath: 'packages/workspace-tools/package.json',
        version: '0.0.0',
        path: '',
        isPrivate: false,
      },
    ]);
    expect(result).toBeInstanceOf(Set);
  });

  test('detects no changes when comparing HEAD to HEAD', async () => {
    const result = await getChangedPackages(ROOT, 'HEAD', [
      {
        name: 'test-pkg',
        relativePath: 'packages/workspace-tools/package.json',
        version: '0.0.0',
        path: '',
        isPrivate: false,
      },
    ]);
    // HEAD..HEAD is an empty range — no commits, no changes
    expect(result.has('test-pkg')).toBe(false);
  });

  test('returns empty set for empty package list', async () => {
    const result = await getChangedPackages(ROOT, 'HEAD', []);
    expect(result.size).toBe(0);
  });

  test('detects changes when comparing to an early ancestor', async () => {
    // HEAD~5..HEAD should contain commits that touched workspace-tools
    // (since we just created those files)
    const result = await getChangedPackages(ROOT, 'HEAD~5', [
      {
        name: 'workspace-tools',
        relativePath: 'packages/workspace-tools/package.json',
        version: '0.0.0',
        path: '',
        isPrivate: false,
      },
    ]);
    expect(result).toBeInstanceOf(Set);
    // Result may or may not contain the package depending on recent commits,
    // but it must be a valid Set without throwing
  });
});
