/**
 * Unit tests for the node:fs/promises shim.
 *
 * The shim forwards to `globalThis.__brika_fs`. Tests install a mock runtime
 * on the global before each call and restore it afterward.
 *
 * The shim uses the `runtime()` helper which throws when `__brika_fs` is
 * undefined, so we also test that guard.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { BrikaFsRuntime } from '@brika/sdk/grants/fs-runtime';
import {
  access,
  appendFile,
  copyFile,
  cp,
  type Dirent,
  exists,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  type Stats,
  stat,
  unlink,
  writeFile,
} from './node-fs-promises-shim';

// ─── Mock runtime builder ─────────────────────────────────────────────────────

type DeepPartial<T> = { [K in keyof T]?: T[K] };

function makeRuntime(overrides: DeepPartial<BrikaFsRuntime> = {}): BrikaFsRuntime {
  const base: BrikaFsRuntime = {
    readFile: async ({ encoding }) =>
      encoding === 'utf-8'
        ? { encoding: 'utf-8', content: 'file content' }
        : { encoding: 'binary', content: new Uint8Array([1, 2, 3]) },
    writeFile: async ({ content }) => ({
      bytesWritten: typeof content === 'string' ? content.length : content.byteLength,
    }),
    readdir: async () => ({
      entries: [
        {
          name: 'a.txt',
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          size: 10,
          mtime: 1000,
        },
        { name: 'subdir', isFile: false, isDirectory: true, isSymlink: false, size: 0, mtime: 0 },
        { name: 'link', isFile: false, isDirectory: false, isSymlink: true, size: 0, mtime: 0 },
      ],
    }),
    stat: async () => ({
      size: 42,
      mtimeMs: 1000,
      isFile: true,
      isDirectory: false,
      isSymlink: false,
    }),
    mkdir: async () => ({ created: true }),
    rm: async () => ({ removed: true }),
    exists: async ({ path }) => ({ exists: path !== '/missing' }),
  };
  return { ...base, ...overrides };
}

let savedFs: typeof globalThis.__brika_fs;

beforeEach(() => {
  savedFs = globalThis.__brika_fs;
  globalThis.__brika_fs = makeRuntime();
});

afterEach(() => {
  globalThis.__brika_fs = savedFs;
});

// ─── runtime() guard ─────────────────────────────────────────────────────────

describe('runtime guard', () => {
  test('throws when __brika_fs is not installed', async () => {
    globalThis.__brika_fs = undefined;
    await expect(readFile('/any')).rejects.toThrow('node:fs/promises shim called before');
  });
});

// ─── readFile ─────────────────────────────────────────────────────────────────

describe('readFile', () => {
  test('no options returns binary Uint8Array', async () => {
    const result = await readFile('/file.bin');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test('options = undefined returns binary', async () => {
    const result = await readFile('/file.bin', undefined);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test('options = null returns binary', async () => {
    const result = await readFile('/file.bin', null);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test('options = "utf-8" returns string', async () => {
    const result = await readFile('/file.txt', 'utf-8');
    expect(typeof result).toBe('string');
    expect(result).toBe('file content');
  });

  test('options = "utf8" (alias) returns string', async () => {
    const result = await readFile('/file.txt', 'utf8');
    expect(typeof result).toBe('string');
  });

  test('options = { encoding: "utf-8" } returns string', async () => {
    const result = await readFile('/file.txt', { encoding: 'utf-8' });
    expect(typeof result).toBe('string');
  });

  test('options = { encoding: undefined } returns binary', async () => {
    const result = await readFile('/file.bin', { encoding: undefined });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test('options = { encoding: null } returns binary', async () => {
    const result = await readFile('/file.bin', { encoding: null });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test('options = { encoding: "binary" } returns binary', async () => {
    const result = await readFile('/file.bin', { encoding: 'binary' });
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

// ─── writeFile ────────────────────────────────────────────────────────────────

describe('writeFile', () => {
  test('calls runtime writeFile with overwrite mode', async () => {
    const calls: Parameters<BrikaFsRuntime['writeFile']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      writeFile: async (args) => {
        calls.push(args);
        return {
          bytesWritten:
            typeof args.content === 'string' ? args.content.length : args.content.byteLength,
        };
      },
    });
    await writeFile('/out.txt', 'hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.mode).toBe('overwrite');
    expect(calls[0]?.path).toBe('/out.txt');
  });
});

// ─── appendFile ───────────────────────────────────────────────────────────────

describe('appendFile', () => {
  test('calls runtime writeFile with append mode', async () => {
    const calls: Parameters<BrikaFsRuntime['writeFile']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      writeFile: async (args) => {
        calls.push(args);
        return {
          bytesWritten:
            typeof args.content === 'string' ? args.content.length : args.content.byteLength,
        };
      },
    });
    await appendFile('/log.txt', 'line\n');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.mode).toBe('append');
  });
});

// ─── readdir ──────────────────────────────────────────────────────────────────

describe('readdir', () => {
  test('without withFileTypes returns string array', async () => {
    const result = await readdir('/dir');
    expect(result).toEqual(['a.txt', 'subdir', 'link']);
  });

  test('without options returns string array', async () => {
    const result = await readdir('/dir', undefined);
    expect(result).toEqual(['a.txt', 'subdir', 'link']);
  });

  test('with withFileTypes:true returns Dirent array', async () => {
    const result = (await readdir('/dir', { withFileTypes: true })) as Dirent[];
    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe('a.txt');
    expect(result[0]?.isFile()).toBe(true);
    expect(result[0]?.isDirectory()).toBe(false);
    expect(result[0]?.isSymbolicLink()).toBe(false);
  });

  test('Dirent.isDirectory() returns true for directory entry', async () => {
    const result = (await readdir('/dir', { withFileTypes: true })) as Dirent[];
    const dir = result.find((e) => e.name === 'subdir');
    expect(dir?.isDirectory()).toBe(true);
    expect(dir?.isFile()).toBe(false);
  });

  test('Dirent.isSymbolicLink() returns true for symlink entry', async () => {
    const result = (await readdir('/dir', { withFileTypes: true })) as Dirent[];
    const link = result.find((e) => e.name === 'link');
    expect(link?.isSymbolicLink()).toBe(true);
  });

  test('passes recursive:true when option is set', async () => {
    const calls: Parameters<BrikaFsRuntime['readdir']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      readdir: async (args) => {
        calls.push(args);
        return { entries: [] };
      },
    });
    await readdir('/dir', { recursive: true });
    expect(calls[0]?.recursive).toBe(true);
  });

  test('recursive defaults to false when not specified', async () => {
    const calls: Parameters<BrikaFsRuntime['readdir']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      readdir: async (args) => {
        calls.push(args);
        return { entries: [] };
      },
    });
    await readdir('/dir');
    expect(calls[0]?.recursive).toBe(false);
  });
});

// ─── stat / lstat ─────────────────────────────────────────────────────────────

describe('stat', () => {
  test('returns Stats object with correct fields', async () => {
    const s: Stats = await stat('/file.txt');
    expect(s.size).toBe(42);
    expect(s.mtimeMs).toBe(1000);
    expect(s.isFile()).toBe(true);
    expect(s.isDirectory()).toBe(false);
    expect(s.isSymbolicLink()).toBe(false);
  });

  test('isDirectory() returns true for directory stats', async () => {
    globalThis.__brika_fs = makeRuntime({
      stat: async () => ({
        size: 0,
        mtimeMs: 0,
        isFile: false,
        isDirectory: true,
        isSymlink: false,
      }),
    });
    const s = await stat('/dir');
    expect(s.isDirectory()).toBe(true);
    expect(s.isFile()).toBe(false);
  });

  test('isSymbolicLink() returns true for symlink stats', async () => {
    globalThis.__brika_fs = makeRuntime({
      stat: async () => ({
        size: 0,
        mtimeMs: 0,
        isFile: false,
        isDirectory: false,
        isSymlink: true,
      }),
    });
    const s = await stat('/link');
    expect(s.isSymbolicLink()).toBe(true);
  });
});

describe('lstat', () => {
  test('lstat is the same function reference as stat', () => {
    expect(lstat).toBe(stat);
  });

  test('lstat returns Stats like stat', async () => {
    const s = await lstat('/file.txt');
    expect(s.size).toBe(42);
  });
});

// ─── mkdir ────────────────────────────────────────────────────────────────────

describe('mkdir', () => {
  test('returns path when directory is created', async () => {
    const result = await mkdir('/new/dir');
    expect(result).toBe('/new/dir');
  });

  test('returns undefined when directory was not newly created', async () => {
    globalThis.__brika_fs = makeRuntime({
      mkdir: async () => ({ created: false }),
    });
    const result = await mkdir('/existing/dir');
    expect(result).toBeUndefined();
  });

  test('passes recursive:true when option is set', async () => {
    const calls: Parameters<BrikaFsRuntime['mkdir']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      mkdir: async (args) => {
        calls.push(args);
        return { created: true };
      },
    });
    await mkdir('/dir', { recursive: true });
    expect(calls[0]?.recursive).toBe(true);
  });

  test('passes recursive:false by default', async () => {
    const calls: Parameters<BrikaFsRuntime['mkdir']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      mkdir: async (args) => {
        calls.push(args);
        return { created: true };
      },
    });
    await mkdir('/dir');
    expect(calls[0]?.recursive).toBe(false);
  });
});

// ─── rm ───────────────────────────────────────────────────────────────────────

describe('rm', () => {
  test('calls runtime rm with correct args', async () => {
    const calls: Parameters<BrikaFsRuntime['rm']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      rm: async (args) => {
        calls.push(args);
        return { removed: true };
      },
    });
    await rm('/dir', { recursive: true, force: true });
    expect(calls[0]?.recursive).toBe(true);
    expect(calls[0]?.force).toBe(true);
  });

  test('defaults recursive and force to false', async () => {
    const calls: Parameters<BrikaFsRuntime['rm']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      rm: async (args) => {
        calls.push(args);
        return { removed: true };
      },
    });
    await rm('/file');
    expect(calls[0]?.recursive).toBe(false);
    expect(calls[0]?.force).toBe(false);
  });
});

// ─── unlink ───────────────────────────────────────────────────────────────────

describe('unlink', () => {
  test('calls runtime rm with recursive:false, force:false', async () => {
    const calls: Parameters<BrikaFsRuntime['rm']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      rm: async (args) => {
        calls.push(args);
        return { removed: true };
      },
    });
    await unlink('/file.txt');
    expect(calls[0]?.path).toBe('/file.txt');
    expect(calls[0]?.recursive).toBe(false);
    expect(calls[0]?.force).toBe(false);
  });
});

// ─── access ───────────────────────────────────────────────────────────────────

describe('access', () => {
  test('resolves when file exists', async () => {
    await expect(access('/existing')).resolves.toBeUndefined();
  });

  test('rejects with ENOENT error when file does not exist', async () => {
    await expect(access('/missing')).rejects.toThrow('ENOENT');
  });

  test('error has code ENOENT and path set', async () => {
    let caughtErr: unknown;
    try {
      await access('/missing');
    } catch (err) {
      caughtErr = err;
    }
    expect(caughtErr).toBeInstanceOf(Error);
    const e = caughtErr as NodeJS.ErrnoException;
    expect(e.code).toBe('ENOENT');
    expect(e.path).toBe('/missing');
  });
});

// ─── exists ───────────────────────────────────────────────────────────────────

describe('exists', () => {
  test('returns true for existing path', async () => {
    expect(await exists('/something')).toBe(true);
  });

  test('returns false for missing path', async () => {
    expect(await exists('/missing')).toBe(false);
  });
});

// ─── copyFile / cp ────────────────────────────────────────────────────────────

describe('copyFile', () => {
  test('reads src and writes to dst with overwrite mode', async () => {
    const readCalls: string[] = [];
    const writeCalls: { path: string; mode: string }[] = [];

    globalThis.__brika_fs = makeRuntime({
      readFile: async ({ path }) => {
        readCalls.push(path);
        return { encoding: 'binary', content: new Uint8Array([9, 8, 7]) };
      },
      writeFile: async ({ path, mode }) => {
        writeCalls.push({ path, mode });
        return { bytesWritten: 3 };
      },
    });

    await copyFile('/src.bin', '/dst.bin');
    expect(readCalls).toContain('/src.bin');
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]?.path).toBe('/dst.bin');
    expect(writeCalls[0]?.mode).toBe('overwrite');
  });

  test('reads with binary encoding to preserve bytes', async () => {
    const readArgs: Parameters<BrikaFsRuntime['readFile']>[0][] = [];
    globalThis.__brika_fs = makeRuntime({
      readFile: async (args) => {
        readArgs.push(args);
        return { encoding: 'binary', content: new Uint8Array() };
      },
      writeFile: async ({ content }) => ({
        bytesWritten: typeof content === 'string' ? content.length : content.byteLength,
      }),
    });
    await copyFile('/a', '/b');
    expect(readArgs[0]?.encoding).toBe('binary');
  });
});

describe('cp', () => {
  test('cp is the same function reference as copyFile', () => {
    expect(cp).toBe(copyFile);
  });
});

// ─── rename ───────────────────────────────────────────────────────────────────

describe('rename', () => {
  test('copies then unlinks the source', async () => {
    const rmCalls: Parameters<BrikaFsRuntime['rm']>[0][] = [];
    const writeCalls: Parameters<BrikaFsRuntime['writeFile']>[0][] = [];

    globalThis.__brika_fs = makeRuntime({
      readFile: async () => ({ encoding: 'binary', content: new Uint8Array([1]) }),
      writeFile: async (args) => {
        writeCalls.push(args);
        return {
          bytesWritten:
            typeof args.content === 'string' ? args.content.length : args.content.byteLength,
        };
      },
      rm: async (args) => {
        rmCalls.push(args);
        return { removed: true };
      },
    });

    await rename('/old.txt', '/new.txt');

    // Should have written to the new path
    expect(writeCalls[0]?.path).toBe('/new.txt');
    // Should have removed the old path
    expect(rmCalls[0]?.path).toBe('/old.txt');
    expect(rmCalls[0]?.recursive).toBe(false);
    expect(rmCalls[0]?.force).toBe(false);
  });
});

// ─── default export ───────────────────────────────────────────────────────────

describe('default export', () => {
  test('default export contains all named exports', async () => {
    const mod = await import('./node-fs-promises-shim');
    const def = mod.default;
    expect(typeof def.readFile).toBe('function');
    expect(typeof def.writeFile).toBe('function');
    expect(typeof def.appendFile).toBe('function');
    expect(typeof def.readdir).toBe('function');
    expect(typeof def.stat).toBe('function');
    expect(typeof def.lstat).toBe('function');
    expect(typeof def.mkdir).toBe('function');
    expect(typeof def.rm).toBe('function');
    expect(typeof def.unlink).toBe('function');
    expect(typeof def.access).toBe('function');
    expect(typeof def.exists).toBe('function');
    expect(typeof def.copyFile).toBe('function');
    expect(typeof def.cp).toBe('function');
    expect(typeof def.rename).toBe('function');
  });

  test('default export functions are the same references as named exports', async () => {
    const mod = await import('./node-fs-promises-shim');
    expect(mod.default.readFile).toBe(mod.readFile);
    expect(mod.default.writeFile).toBe(mod.writeFile);
    expect(mod.default.stat).toBe(mod.stat);
    expect(mod.default.lstat).toBe(mod.lstat);
    expect(mod.default.cp).toBe(mod.copyFile);
  });
});
