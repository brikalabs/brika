/**
 * `paths.ts` resolves the on-disk layout the CLI shares with the hub.
 * We exercise the public surface (`brikaHome`, `pidFile`) — the
 * `isCompiled` branch is a module-load-time constant that can't be
 * flipped from inside a test, so we cover env-override + the
 * workspace-root climb + the cwd fallback instead.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brikaHome, pidFile } from './paths';

describe('brikaHome', () => {
  let root: string;
  let originalCwd: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = process.env.BRIKA_HOME;
    // macOS resolves /var/folders/... to /private/var/folders/... when
    // chdir'd into — realpath up-front so we can compare strings 1:1.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'brika-paths-')));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test('honours BRIKA_HOME when set', () => {
    process.env.BRIKA_HOME = '/explicit/brika/home';
    expect(brikaHome()).toBe('/explicit/brika/home');
  });

  test('falls back to <workspace-root>/.brika when an ancestor declares workspaces', () => {
    delete process.env.BRIKA_HOME;
    const workspaceRoot = join(root, 'workspace');
    const nested = join(workspaceRoot, 'apps', 'cli');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
      'utf8'
    );
    process.chdir(nested);
    expect(brikaHome()).toBe(join(workspaceRoot, '.brika'));
  });

  test('uses <cwd>/.brika when no ancestor declares workspaces', () => {
    delete process.env.BRIKA_HOME;
    const isolated = join(root, 'isolated');
    mkdirSync(isolated);
    process.chdir(isolated);
    expect(brikaHome()).toBe(join(isolated, '.brika'));
  });

  test('skips a malformed package.json and keeps climbing', () => {
    delete process.env.BRIKA_HOME;
    const workspaceRoot = join(root, 'mono');
    const broken = join(workspaceRoot, 'broken');
    const nested = join(broken, 'cli');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(broken, 'package.json'), '{ not json', 'utf8');
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['*'] }),
      'utf8'
    );
    process.chdir(nested);
    expect(brikaHome()).toBe(join(workspaceRoot, '.brika'));
  });

  test('ignores package.json without a workspaces field', () => {
    delete process.env.BRIKA_HOME;
    const pkgRoot = join(root, 'just-a-pkg');
    mkdirSync(pkgRoot);
    writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'plain' }), 'utf8');
    process.chdir(pkgRoot);
    expect(brikaHome()).toBe(join(pkgRoot, '.brika'));
  });
});

describe('pidFile', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.BRIKA_HOME;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = originalEnv;
    }
  });

  test('returns <brikaHome>/.system/brika.pid', () => {
    process.env.BRIKA_HOME = '/var/brika';
    expect(pidFile()).toBe('/var/brika/.system/brika.pid');
  });
});
