import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWorkspaceRoot, isCompiledFrom, peekInstanceId, resolveDataDir } from './exec-context';

describe('isCompiledFrom', () => {
  test('true only for the bunfs virtual path', () => {
    expect(isCompiledFrom('/$bunfs/root/main.ts')).toBe(true);
    expect(isCompiledFrom('/Users/x/project/apps/hub/src/main.ts')).toBe(false);
    expect(isCompiledFrom('')).toBe(false);
  });
});

describe('resolveDataDir matrix', () => {
  const tmp: string[] = [];
  afterEach(async () => {
    await Promise.all(tmp.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function makeWorkspace(): Promise<string> {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'brika-ws-')));
    tmp.push(root);
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'ws', workspaces: ['apps/*'] })
    );
    await mkdir(join(root, 'apps', 'hub'), { recursive: true });
    return root;
  }

  test('$BRIKA_HOME wins over everything', () => {
    const r = resolveDataDir({
      env: { BRIKA_HOME: '/custom/home' },
      isCompiled: true,
      execPath: '/opt/brika/bin/brika',
      cwd: '/anywhere',
    });
    expect(r).toEqual({ path: '/custom/home', source: 'env' });
  });

  test('compiled binary -> parent of the install dir', () => {
    const r = resolveDataDir({
      env: {},
      isCompiled: true,
      execPath: '/opt/brika/bin/brika',
      cwd: '/anywhere',
    });
    // dirname(dirname('/opt/brika/bin/brika')) === '/opt/brika'
    expect(r).toEqual({ path: '/opt/brika', source: 'compiled-parent' });
  });

  test('npm install (env marker) -> per-user ~/.brika, NOT binary-relative', () => {
    const r = resolveDataDir({
      env: { BRIKA_INSTALL: 'npm' },
      isCompiled: true,
      execPath: '/usr/local/lib/node_modules/@brika/cli-linux-x64/bin/brika',
      cwd: '/anywhere',
      home: '/home/me',
      platform: 'linux',
    });
    expect(r).toEqual({ path: '/home/me/.brika', source: 'npm' });
  });

  test('npm install (node_modules in execPath) -> per-user dir without the marker', () => {
    const r = resolveDataDir({
      env: {},
      isCompiled: true,
      execPath: '/usr/local/lib/node_modules/@brika/cli-darwin-arm64/bin/brika',
      cwd: '/anywhere',
      home: '/Users/me',
      platform: 'darwin',
    });
    expect(r).toEqual({ path: '/Users/me/.brika', source: 'npm' });
  });

  test('npm install on Windows -> %LOCALAPPDATA%\\brika', () => {
    const r = resolveDataDir({
      env: { BRIKA_INSTALL: 'npm', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
      isCompiled: true,
      execPath:
        'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@brika\\cli-win32-x64\\bin\\brika.exe',
      cwd: 'C:\\anywhere',
      home: 'C:\\Users\\me',
      platform: 'win32',
    });
    expect(r).toEqual({ path: join('C:\\Users\\me\\AppData\\Local', 'brika'), source: 'npm' });
  });

  test('$BRIKA_HOME still wins over an npm install', () => {
    const r = resolveDataDir({
      env: { BRIKA_HOME: '/custom', BRIKA_INSTALL: 'npm' },
      isCompiled: true,
      execPath: '/usr/local/lib/node_modules/@brika/cli-linux-x64/bin/brika',
      cwd: '/anywhere',
      home: '/home/me',
      platform: 'linux',
    });
    expect(r).toEqual({ path: '/custom', source: 'env' });
  });

  test('curl install (compiled, no node_modules, no marker) stays binary-relative', () => {
    const r = resolveDataDir({
      env: {},
      isCompiled: true,
      execPath: '/home/me/.brika/bin/brika',
      cwd: '/anywhere',
      home: '/home/me',
      platform: 'linux',
    });
    // The npm branch must NOT trigger for a normal curl install.
    expect(r).toEqual({ path: '/home/me/.brika', source: 'compiled-parent' });
  });

  test('dev, cwd = workspace root -> <root>/.brika', async () => {
    const root = await makeWorkspace();
    const r = resolveDataDir({ env: {}, isCompiled: false, execPath: '/usr/bin/bun', cwd: root });
    expect(r).toEqual({ path: join(root, '.brika'), source: 'workspace' });
  });

  test('dev, cwd = a SUBDIR of the workspace -> still <root>/.brika (the mortar-drift cell)', async () => {
    const root = await makeWorkspace();
    const r = resolveDataDir({
      env: {},
      isCompiled: false,
      execPath: '/usr/bin/bun',
      cwd: join(root, 'apps', 'hub'),
    });
    expect(r).toEqual({ path: join(root, '.brika'), source: 'workspace' });
  });

  test('dev, cwd outside any workspace -> <cwd>/.brika', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'brika-bare-')));
    tmp.push(outside);
    const r = resolveDataDir({
      env: {},
      isCompiled: false,
      execPath: '/usr/bin/bun',
      cwd: outside,
    });
    expect(r).toEqual({ path: join(outside, '.brika'), source: 'cwd' });
  });
});

describe('peekInstanceId', () => {
  const tmp: string[] = [];
  afterEach(async () => {
    await Promise.all(tmp.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  test('reads a valid id, never generates, null on miss/corrupt', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'brika-iid-')));
    tmp.push(dir);
    expect(peekInstanceId(dir)).toBeNull(); // missing -> null, and NOT created
    expect(existsSync(join(dir, 'instance.id'))).toBe(false);

    await writeFile(join(dir, 'instance.id'), 'deadbeef');
    expect(peekInstanceId(dir)).toBe('deadbeef');

    await writeFile(join(dir, 'instance.id'), 'NOT-HEX');
    expect(peekInstanceId(dir)).toBeNull();
  });
});

describe('findWorkspaceRoot', () => {
  const tmp: string[] = [];
  afterEach(async () => {
    await Promise.all(tmp.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  test('returns undefined outside a workspace', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'brika-no- ')));
    tmp.push(dir);
    expect(findWorkspaceRoot({ cwd: dir })).toBeUndefined();
  });

  test('respects the depth cap', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'brika-deep-')));
    tmp.push(root);
    await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['*'] }));
    const deep = join(root, 'a', 'b', 'c');
    await mkdir(deep, { recursive: true });
    expect(findWorkspaceRoot({ cwd: deep })).toBe(root);
    expect(findWorkspaceRoot({ cwd: deep, maxDepth: 1 })).toBeUndefined();
  });

  test('keeps climbing past a malformed package.json', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'brika-bad-')));
    tmp.push(root);
    await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['*'] }));
    const child = join(root, 'pkg');
    await mkdir(child, { recursive: true });
    await writeFile(join(child, 'package.json'), '{ not valid json');
    // The child's package.json throws on parse: the walk must swallow it and
    // keep climbing to the real workspace root rather than aborting.
    expect(findWorkspaceRoot({ cwd: child })).toBe(root);
  });
});
