/**
 * Unit tests for `grants/fs.ts` — schema parses, virtual-root constants,
 * and the redact / placeholder handler functions for every fs verb.
 */

import { describe, expect, test } from 'bun:test';
import {
  FsExistsArgsSchema,
  FsExistsResultSchema,
  FsMkdirArgsSchema,
  FsMkdirResultSchema,
  FsPathSchema,
  FsPatternSchema,
  FsReaddirArgsSchema,
  FsReaddirResultSchema,
  FsReadFileArgsSchema,
  FsReadFileResultSchema,
  FsRmArgsSchema,
  FsRmResultSchema,
  FsScopeSchema,
  FsStatArgsSchema,
  FsStatResultSchema,
  FsWriteFileArgsSchema,
  FsWriteFileResultSchema,
  fsExists,
  fsMkdir,
  fsReaddir,
  fsReadFile,
  fsRm,
  fsStat,
  fsWriteFile,
  VIRTUAL_ROOTS,
} from './fs';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: { read: [], write: [] },
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('VIRTUAL_ROOTS', () => {
  test('lists exactly the four documented roots', () => {
    expect(VIRTUAL_ROOTS).toEqual(['/bundle', '/data', '/cache', '/tmp']);
  });
});

describe('FsPathSchema', () => {
  test('accepts a normal virtual path', () => {
    expect(FsPathSchema.parse('/data/state.json')).toBe('/data/state.json');
  });

  test('rejects NUL bytes', () => {
    expect(() => FsPathSchema.parse('/data/x\0y')).toThrow(/NUL byte/);
  });

  test('enforces length bounds', () => {
    expect(() => FsPathSchema.parse('')).toThrow();
    expect(() => FsPathSchema.parse('/'.padEnd(1025, 'a'))).toThrow();
  });
});

describe('FsPatternSchema', () => {
  test('parses simple patterns', () => {
    expect(FsPatternSchema.parse('/data/**')).toBe('/data/**');
  });
});

describe('FsScopeSchema', () => {
  test('defaults read + write to empty arrays', () => {
    expect(FsScopeSchema.parse({})).toEqual({ read: [], write: [] });
  });

  test('accepts populated allow-lists', () => {
    expect(FsScopeSchema.parse({ read: ['/data/**'], write: ['/data/state.json'] })).toEqual({
      read: ['/data/**'],
      write: ['/data/state.json'],
    });
  });
});

describe('fs.readFile spec', () => {
  test('defaults encoding to utf-8', () => {
    expect(FsReadFileArgsSchema.parse({ path: '/data/x' })).toEqual({
      path: '/data/x',
      encoding: 'utf-8',
    });
  });

  test('result schema discriminates on encoding', () => {
    expect(FsReadFileResultSchema.parse({ encoding: 'utf-8', content: 'hello' })).toEqual({
      encoding: 'utf-8',
      content: 'hello',
    });
    const binary = FsReadFileResultSchema.parse({
      encoding: 'binary',
      content: new Uint8Array([1, 2, 3]),
    });
    expect(binary.encoding).toBe('binary');
  });

  test('redact.args drops nothing (path + encoding are safe)', () => {
    const summary = fsReadFile.spec.redact?.args?.({ path: '/data/x', encoding: 'utf-8' });
    expect(summary).toEqual({ path: '/data/x', encoding: 'utf-8' });
  });

  test('redact.result summarises bytes for utf-8', () => {
    const summary = fsReadFile.spec.redact?.result?.({ encoding: 'utf-8', content: 'hello' });
    expect(summary).toEqual({ encoding: 'utf-8', bytes: 5 });
  });

  test('redact.result summarises bytes for binary', () => {
    const summary = fsReadFile.spec.redact?.result?.({
      encoding: 'binary',
      content: new Uint8Array([1, 2, 3, 4]),
    });
    expect(summary).toEqual({ encoding: 'binary', bytes: 4 });
  });

  test('SDK-side handler throws', () => {
    expect(() =>
      fsReadFile.handler(stubHandlerCtx, { path: '/data/x', encoding: 'utf-8' })
    ).toThrow(/SDK-side handler invoked/);
  });
});

describe('fs.writeFile spec', () => {
  test('defaults mode to overwrite', () => {
    expect(FsWriteFileArgsSchema.parse({ path: '/data/x', content: 'hi' })).toEqual({
      path: '/data/x',
      content: 'hi',
      mode: 'overwrite',
    });
  });

  test('accepts every documented mode', () => {
    for (const mode of ['overwrite', 'append', 'create-new'] as const) {
      expect(FsWriteFileArgsSchema.parse({ path: '/data/x', content: 'hi', mode }).mode).toBe(mode);
    }
  });

  test('result schema parses bytesWritten', () => {
    expect(FsWriteFileResultSchema.parse({ bytesWritten: 42 })).toEqual({ bytesWritten: 42 });
    expect(() => FsWriteFileResultSchema.parse({ bytesWritten: -1 })).toThrow();
  });

  test('redact.args summarises string bytes', () => {
    const summary = fsWriteFile.spec.redact?.args?.({
      path: '/data/x',
      content: 'hello',
      mode: 'overwrite',
    });
    expect(summary).toEqual({ path: '/data/x', mode: 'overwrite', bytes: 5 });
  });

  test('redact.args summarises binary bytes', () => {
    const summary = fsWriteFile.spec.redact?.args?.({
      path: '/data/x',
      content: new Uint8Array([1, 2, 3]),
      mode: 'append',
    });
    expect(summary).toEqual({ path: '/data/x', mode: 'append', bytes: 3 });
  });

  test('SDK-side handler throws', () => {
    expect(() =>
      fsWriteFile.handler(stubHandlerCtx, {
        path: '/data/x',
        content: 'hi',
        mode: 'overwrite',
      })
    ).toThrow(/SDK-side handler invoked/);
  });
});

describe('fs.readdir spec', () => {
  test('defaults recursive to false', () => {
    expect(FsReaddirArgsSchema.parse({ path: '/data' })).toEqual({
      path: '/data',
      recursive: false,
    });
  });

  test('result schema parses entry list', () => {
    expect(
      FsReaddirResultSchema.parse({
        entries: [
          {
            name: 'x',
            isFile: true,
            isDirectory: false,
            isSymlink: false,
            size: 1,
            mtime: 0,
          },
        ],
      }).entries
    ).toHaveLength(1);
  });

  test('redact.result summarises entryCount', () => {
    const summary = fsReaddir.spec.redact?.result?.({
      entries: [
        { name: 'a', isFile: true, isDirectory: false, isSymlink: false, size: 1, mtime: 0 },
        { name: 'b', isFile: false, isDirectory: true, isSymlink: false, size: 0, mtime: 0 },
      ],
    });
    expect(summary).toEqual({ entryCount: 2 });
  });

  test('SDK-side handler throws', () => {
    expect(() => fsReaddir.handler(stubHandlerCtx, { path: '/data', recursive: false })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('fs.stat spec', () => {
  test('result schema parses a stat block', () => {
    expect(
      FsStatResultSchema.parse({
        size: 42,
        mtimeMs: 1000,
        isFile: true,
        isDirectory: false,
        isSymlink: false,
      }).size
    ).toBe(42);
  });

  test('args schema parses', () => {
    expect(FsStatArgsSchema.parse({ path: '/data/x' })).toEqual({ path: '/data/x' });
  });

  test('SDK-side handler throws', () => {
    expect(() => fsStat.handler(stubHandlerCtx, { path: '/data/x' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('fs.mkdir spec', () => {
  test('defaults recursive to false', () => {
    expect(FsMkdirArgsSchema.parse({ path: '/data/new' })).toEqual({
      path: '/data/new',
      recursive: false,
    });
  });

  test('result schema parses created flag', () => {
    expect(FsMkdirResultSchema.parse({ created: true })).toEqual({ created: true });
  });

  test('SDK-side handler throws', () => {
    expect(() => fsMkdir.handler(stubHandlerCtx, { path: '/data/new', recursive: false })).toThrow(
      /SDK-side handler invoked/
    );
  });
});

describe('fs.rm spec', () => {
  test('defaults recursive + force to false', () => {
    expect(FsRmArgsSchema.parse({ path: '/data/x' })).toEqual({
      path: '/data/x',
      recursive: false,
      force: false,
    });
  });

  test('result schema parses removed flag', () => {
    expect(FsRmResultSchema.parse({ removed: false })).toEqual({ removed: false });
  });

  test('SDK-side handler throws', () => {
    expect(() =>
      fsRm.handler(stubHandlerCtx, { path: '/data/x', recursive: true, force: true })
    ).toThrow(/SDK-side handler invoked/);
  });
});

describe('fs.exists spec', () => {
  test('args + result schemas round-trip', () => {
    expect(FsExistsArgsSchema.parse({ path: '/data/x' })).toEqual({ path: '/data/x' });
    expect(FsExistsResultSchema.parse({ exists: true })).toEqual({ exists: true });
  });

  test('SDK-side handler throws', () => {
    expect(() => fsExists.handler(stubHandlerCtx, { path: '/data/x' })).toThrow(
      /SDK-side handler invoked/
    );
  });
});
