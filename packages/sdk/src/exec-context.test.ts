import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findWorkspaceRoot,
  isCompiledFrom,
  isManagedInstall,
  peekInstanceId,
  resolveDataDir,
} from './exec-context';

type DataDirInput = Parameters<typeof resolveDataDir>[0];
type DataDirResult = ReturnType<typeof resolveDataDir>;

// Every test that mints a temp dir registers it here; one afterEach reaps them all.
const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A realpath'd temp dir, auto-cleaned after the test. */
async function tempDir(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  tmpDirs.push(dir);
  return dir;
}

/** A temp workspace root (package.json with `workspaces`) plus an apps/hub subdir. */
async function makeWorkspace(): Promise<string> {
  const root = await tempDir('brika-ws-');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'ws', workspaces: ['apps/*'] })
  );
  await mkdir(join(root, 'apps', 'hub'), { recursive: true });
  return root;
}

describe('isCompiledFrom', () => {
  test('true only for the bunfs virtual path', () => {
    expect(isCompiledFrom('/$bunfs/root/main.ts')).toBe(true);
    expect(isCompiledFrom('/Users/x/project/apps/hub/src/main.ts')).toBe(false);
    expect(isCompiledFrom('')).toBe(false);
  });
});

describe('isManagedInstall', () => {
  test.each<[string, Parameters<typeof isManagedInstall>[0], boolean]>([
    [
      'true when the launcher exported the managed marker',
      { env: { BRIKA_INSTALL: 'managed' }, execPath: '/usr/local/bin/brika' },
      true,
    ],
    [
      'true when the binary lives under node_modules (marker stripped)',
      { env: {}, execPath: '/usr/local/lib/node_modules/@brika/cli-darwin-arm64/bin/brika' },
      true,
    ],
    [
      'false for a curl|sh install (no marker, not under node_modules)',
      { env: {}, execPath: '/Users/me/.brika/bin/brika' },
      false,
    ],
  ])('%s', (_name, input, expected) => {
    expect(isManagedInstall(input)).toBe(expected);
  });
});

describe('resolveDataDir matrix', () => {
  test.each<[string, DataDirInput, DataDirResult]>([
    [
      '$BRIKA_HOME wins over everything',
      {
        env: { BRIKA_HOME: '/custom/home' },
        isCompiled: true,
        execPath: '/opt/brika/bin/brika',
        cwd: '/anywhere',
      },
      { path: '/custom/home', source: 'env' },
    ],
    [
      // dirname(dirname('/opt/brika/bin/brika')) === '/opt/brika'
      'compiled binary -> parent of the install dir',
      { env: {}, isCompiled: true, execPath: '/opt/brika/bin/brika', cwd: '/anywhere' },
      { path: '/opt/brika', source: 'compiled-parent' },
    ],
    [
      'package-manager install (env marker) -> per-user ~/.brika, NOT binary-relative',
      {
        env: { BRIKA_INSTALL: 'managed' },
        isCompiled: true,
        execPath: '/usr/local/lib/node_modules/@brika/cli-linux-x64/bin/brika',
        cwd: '/anywhere',
        home: '/home/me',
        platform: 'linux',
      },
      { path: '/home/me/.brika', source: 'managed' },
    ],
    [
      'package-manager install (node_modules in execPath) -> per-user dir without the marker',
      {
        env: {},
        isCompiled: true,
        execPath: '/usr/local/lib/node_modules/@brika/cli-darwin-arm64/bin/brika',
        cwd: '/anywhere',
        home: '/Users/me',
        platform: 'darwin',
      },
      { path: '/Users/me/.brika', source: 'managed' },
    ],
    [
      String.raw`package-manager install on Windows -> %LOCALAPPDATA%\brika`,
      {
        env: { BRIKA_INSTALL: 'managed', LOCALAPPDATA: String.raw`C:\Users\me\AppData\Local` },
        isCompiled: true,
        execPath: String.raw`C:\Users\me\AppData\Roaming\npm\node_modules\@brika\cli-win32-x64\bin\brika.exe`,
        cwd: String.raw`C:\anywhere`,
        home: String.raw`C:\Users\me`,
        platform: 'win32',
      },
      { path: join(String.raw`C:\Users\me\AppData\Local`, 'brika'), source: 'managed' },
    ],
    [
      '$BRIKA_HOME still wins over an package-manager install',
      {
        env: { BRIKA_HOME: '/custom', BRIKA_INSTALL: 'managed' },
        isCompiled: true,
        execPath: '/usr/local/lib/node_modules/@brika/cli-linux-x64/bin/brika',
        cwd: '/anywhere',
        home: '/home/me',
        platform: 'linux',
      },
      { path: '/custom', source: 'env' },
    ],
    [
      // The npm branch must NOT trigger for a normal curl install.
      'curl install (compiled, no node_modules, no marker) stays binary-relative',
      {
        env: {},
        isCompiled: true,
        execPath: '/home/me/.brika/bin/brika',
        cwd: '/anywhere',
        home: '/home/me',
        platform: 'linux',
      },
      { path: '/home/me/.brika', source: 'compiled-parent' },
    ],
  ])('%s', (_name, input, expected) => {
    expect(resolveDataDir(input)).toEqual(expected);
  });

  test('dev, cwd = workspace root -> <root>/.brika', async () => {
    const root = await makeWorkspace();
    expect(
      resolveDataDir({ env: {}, isCompiled: false, execPath: '/usr/bin/bun', cwd: root })
    ).toEqual({
      path: join(root, '.brika'),
      source: 'workspace',
    });
  });

  test('dev, cwd = a SUBDIR of the workspace -> still <root>/.brika (the mortar-drift cell)', async () => {
    const root = await makeWorkspace();
    expect(
      resolveDataDir({
        env: {},
        isCompiled: false,
        execPath: '/usr/bin/bun',
        cwd: join(root, 'apps', 'hub'),
      })
    ).toEqual({ path: join(root, '.brika'), source: 'workspace' });
  });

  test('dev, cwd outside any workspace -> <cwd>/.brika', async () => {
    const outside = await tempDir('brika-bare-');
    expect(
      resolveDataDir({ env: {}, isCompiled: false, execPath: '/usr/bin/bun', cwd: outside })
    ).toEqual({
      path: join(outside, '.brika'),
      source: 'cwd',
    });
  });
});

describe('peekInstanceId', () => {
  test('reads a valid id, never generates, null on miss/corrupt', async () => {
    const dir = await tempDir('brika-iid-');
    expect(peekInstanceId(dir)).toBeNull(); // missing -> null, and NOT created
    expect(existsSync(join(dir, 'instance.id'))).toBe(false);

    await writeFile(join(dir, 'instance.id'), 'deadbeef');
    expect(peekInstanceId(dir)).toBe('deadbeef');

    await writeFile(join(dir, 'instance.id'), 'NOT-HEX');
    expect(peekInstanceId(dir)).toBeNull();
  });
});

describe('findWorkspaceRoot', () => {
  test('returns undefined outside a workspace', async () => {
    const dir = await tempDir('brika-no-');
    expect(findWorkspaceRoot({ cwd: dir })).toBeUndefined();
  });

  test('respects the depth cap', async () => {
    const root = await tempDir('brika-deep-');
    await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['*'] }));
    const deep = join(root, 'a', 'b', 'c');
    await mkdir(deep, { recursive: true });
    expect(findWorkspaceRoot({ cwd: deep })).toBe(root);
    expect(findWorkspaceRoot({ cwd: deep, maxDepth: 1 })).toBeUndefined();
  });

  test('keeps climbing past a malformed package.json', async () => {
    const root = await tempDir('brika-bad-');
    await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['*'] }));
    const child = join(root, 'pkg');
    await mkdir(child, { recursive: true });
    await writeFile(join(child, 'package.json'), '{ not valid json');
    // The child's package.json throws on parse: the walk must swallow it and
    // keep climbing to the real workspace root rather than aborting.
    expect(findWorkspaceRoot({ cwd: child })).toBe(root);
  });
});
