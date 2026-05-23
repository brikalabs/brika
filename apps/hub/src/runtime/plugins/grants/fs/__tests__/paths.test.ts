/**
 * Virtual-path resolution + normalisation tests.
 *
 * The single most security-sensitive module — every fs op runs through
 * it before any host IO. Edge cases here are the difference between
 * "plugin reads its own dir" and "plugin reads /etc/passwd".
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { isWithinBackingDir, resolveVirtualPath } from '../paths';
import type { FsBackingDirs } from '../types';

const DIRS: FsBackingDirs = {
  bundle: '/host/plug/bundle',
  data: '/host/plug/data',
  cache: '/host/plug/cache',
  tmp: '/host/plug/tmp',
};

describe('resolveVirtualPath — accepting valid paths', () => {
  test('every known root resolves to its backing dir', () => {
    expect(resolveVirtualPath('/bundle', DIRS).hostPath).toBe(DIRS.bundle);
    expect(resolveVirtualPath('/data', DIRS).hostPath).toBe(DIRS.data);
    expect(resolveVirtualPath('/cache', DIRS).hostPath).toBe(DIRS.cache);
    expect(resolveVirtualPath('/tmp', DIRS).hostPath).toBe(DIRS.tmp);
  });

  test('subpaths join correctly', () => {
    expect(resolveVirtualPath('/data/foo.json', DIRS).hostPath).toBe(`${DIRS.data}/foo.json`);
    expect(resolveVirtualPath('/data/sub/foo.json', DIRS).hostPath).toBe(
      `${DIRS.data}/sub/foo.json`
    );
  });

  test('redundant separators are normalised', () => {
    expect(resolveVirtualPath('/data//foo.json', DIRS).virtualPath).toBe('/data/foo.json');
  });

  test('intra-root `..` that stays within the root is fine', () => {
    expect(resolveVirtualPath('/data/sub/../foo.json', DIRS).virtualPath).toBe('/data/foo.json');
  });

  test('readOnly flag is true for /bundle only', () => {
    expect(resolveVirtualPath('/bundle/x', DIRS).readOnly).toBe(true);
    expect(resolveVirtualPath('/data/x', DIRS).readOnly).toBe(false);
    expect(resolveVirtualPath('/cache/x', DIRS).readOnly).toBe(false);
    expect(resolveVirtualPath('/tmp/x', DIRS).readOnly).toBe(false);
  });
});

describe('resolveVirtualPath — rejecting escapes', () => {
  function expectReject(p: string): void {
    let thrown: BrikaError | undefined;
    try {
      resolveVirtualPath(p, DIRS);
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('FS_PATH_OUTSIDE_ROOT');
  }

  test('relative paths', () => {
    expectReject('foo.json');
    expectReject('./foo.json');
    expectReject('../foo.json');
  });

  test('paths starting with no known root', () => {
    expectReject('/etc/passwd');
    expectReject('/var/log');
    expectReject('/');
  });

  test('Windows-style host paths', () => {
    expectReject('C:/foo');
    expectReject('\\\\unc\\share');
  });

  test('`..` escape attempts past the root', () => {
    expectReject('/data/../etc/passwd');
    expectReject('/data/../../etc');
    expectReject('/data/sub/../../../etc');
  });

  test('paths matching the root prefix but not the root delimiter', () => {
    // `/databar` shouldn't pretend to be `/data` + `bar`.
    expectReject('/databar/x');
    expectReject('/tmpfoo');
  });

  test('NUL byte in path', () => {
    // This is the schema's responsibility but our resolver still needs
    // to defend if the schema is bypassed.
    expectReject('/data/x\0y');
  });
});

describe('isWithinBackingDir', () => {
  test('exact match counts as within', () => {
    expect(isWithinBackingDir('/a/b', '/a/b')).toBe(true);
  });

  test('subdirectory counts as within', () => {
    expect(isWithinBackingDir('/a/b/c', '/a/b')).toBe(true);
  });

  test('sibling prefix does NOT count', () => {
    expect(isWithinBackingDir('/a/bb', '/a/b')).toBe(false);
  });

  test('parent does not count', () => {
    expect(isWithinBackingDir('/a', '/a/b')).toBe(false);
  });
});
