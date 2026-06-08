import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTarget } from './install';

describe('resolveTarget', () => {
  test('local path resolves to a file: version with the package name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brika-install-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@acme/my-plugin' }));
      const { pkg, version } = await resolveTarget(dir);
      expect(pkg).toBe('@acme/my-plugin');
      expect(version).toBe(`file:${dir}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('npm name with no version', async () => {
    expect(await resolveTarget('brika-plugin-foo')).toEqual({ pkg: 'brika-plugin-foo' });
  });

  test('npm name@version', async () => {
    expect(await resolveTarget('brika-plugin-foo@1.2.0')).toEqual({
      pkg: 'brika-plugin-foo',
      version: '1.2.0',
    });
  });

  test('scoped npm package keeps its leading @', async () => {
    expect(await resolveTarget('@acme/brika-plugin-foo')).toEqual({
      pkg: '@acme/brika-plugin-foo',
    });
  });

  test('scoped npm package with version', async () => {
    expect(await resolveTarget('@acme/brika-plugin-foo@2.0.0')).toEqual({
      pkg: '@acme/brika-plugin-foo',
      version: '2.0.0',
    });
  });

  test('a path with no package.json throws', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brika-install-empty-'));
    try {
      await expect(resolveTarget(`${dir}/`)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
