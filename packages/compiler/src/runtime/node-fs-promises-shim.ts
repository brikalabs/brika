/**
 * `node:fs/promises` shim for plugin bundles.
 *
 * `compileServerEntry` rewrites every `import 'node:fs/promises'` (and
 * the bare `fs/promises` form) to import this file. The shim translates
 * the positional, Buffer-shaped node:fs API into ctx.fs calls via the
 * `globalThis.__brika_fs` runtime the prelude installs.
 *
 * Coverage (v1): readFile, writeFile, appendFile, unlink, rm, mkdir,
 * readdir, stat, lstat, access, cp, copyFile, rename, exists.
 *
 * Out of scope (v2): file handles, watchers, chmod-class, sync forms.
 * The lockdown's deny-list still catches dynamic-import escapes so a
 * plugin can't reach the real `node:fs` even when bundled with the shim.
 */

/* eslint-disable no-var */

import type { BrikaFsRuntime } from '@brika/sdk/grants/fs-runtime';

declare global {
  var __brika_fs: BrikaFsRuntime | undefined;
}

function runtime(): BrikaFsRuntime {
  const r = globalThis.__brika_fs;
  if (!r) {
    throw new Error(
      'node:fs/promises shim called before the Brika prelude installed the fs runtime. ' +
        'This usually means the plugin tried filesystem I/O during top-level module evaluation; ' +
        'move the call into onInit() or a later handler.'
    );
  }
  return r;
}

// ─── readFile / writeFile / appendFile ──────────────────────────────────────

type FsEncoding = 'utf-8' | 'utf8' | 'binary' | null | undefined;
type FsContent = string | Uint8Array;

function normaliseEncoding(encoding: unknown): 'utf-8' | 'binary' {
  if (encoding === 'utf-8' || encoding === 'utf8') {
    return 'utf-8';
  }
  return 'binary';
}

export async function readFile(
  path: string,
  options?: FsEncoding | { encoding?: FsEncoding }
): Promise<string | Uint8Array> {
  const enc =
    options === null || options === undefined || typeof options === 'string'
      ? normaliseEncoding(options ?? 'binary')
      : normaliseEncoding(options.encoding);
  const out = await runtime().readFile({ path, encoding: enc });
  return out.content;
}

export async function writeFile(path: string, data: FsContent): Promise<void> {
  await runtime().writeFile({ path, content: data, mode: 'overwrite' });
}

export async function appendFile(path: string, data: FsContent): Promise<void> {
  await runtime().writeFile({ path, content: data, mode: 'append' });
}

// ─── readdir ────────────────────────────────────────────────────────────────

export interface Dirent {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export async function readdir(
  path: string,
  options?: { withFileTypes?: boolean; recursive?: boolean }
): Promise<string[] | Dirent[]> {
  const out = await runtime().readdir({ path, recursive: options?.recursive ?? false });
  if (options?.withFileTypes) {
    return out.entries.map((e) => makeDirent(e));
  }
  return out.entries.map((e) => e.name);
}

function makeDirent(e: {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}): Dirent {
  return {
    name: e.name,
    isFile: () => e.isFile,
    isDirectory: () => e.isDirectory,
    isSymbolicLink: () => e.isSymlink,
  };
}

// ─── stat / lstat ───────────────────────────────────────────────────────────

export interface Stats {
  readonly size: number;
  readonly mtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

function makeStats(s: {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}): Stats {
  return {
    size: s.size,
    mtimeMs: s.mtimeMs,
    isFile: () => s.isFile,
    isDirectory: () => s.isDirectory,
    isSymbolicLink: () => s.isSymlink,
  };
}

export async function stat(path: string): Promise<Stats> {
  return makeStats(await runtime().stat({ path }));
}

// The hub-side handler already uses lstat semantics (doesn't follow
// symlinks), so they're equivalent for plugin purposes.
export const lstat = stat;

// ─── mkdir / rm / unlink ────────────────────────────────────────────────────

export async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<string | undefined> {
  const out = await runtime().mkdir({ path, recursive: options?.recursive ?? false });
  return out.created ? path : undefined;
}

export async function rm(
  path: string,
  options?: { recursive?: boolean; force?: boolean }
): Promise<void> {
  await runtime().rm({
    path,
    recursive: options?.recursive ?? false,
    force: options?.force ?? false,
  });
}

export async function unlink(path: string): Promise<void> {
  await runtime().rm({ path, recursive: false, force: false });
}

// ─── access / exists ────────────────────────────────────────────────────────

export async function access(path: string): Promise<void> {
  const out = await runtime().exists({ path });
  if (!out.exists) {
    const err = new Error(`ENOENT: no such file or directory, access '${path}'`);
    Object.assign(err, { code: 'ENOENT', path });
    throw err;
  }
}

// `exists` was removed from node:fs/promises in Node 10 but Bun re-exposes
// it; we mirror Bun's shape since plugin code often uses it.
export async function exists(path: string): Promise<boolean> {
  const out = await runtime().exists({ path });
  return out.exists;
}

// ─── copyFile / cp / rename ─────────────────────────────────────────────────

export async function copyFile(src: string, dst: string): Promise<void> {
  // Implemented on top of read+write because the hub doesn't expose a
  // single-call copy yet. Two IPC hops + a buffer; fine for v1.
  // We pin binary encoding on read so the buffer round-trips
  // byte-for-byte regardless of file contents.
  const { content } = await runtime().readFile({ path: src, encoding: 'binary' });
  await runtime().writeFile({ path: dst, content, mode: 'overwrite' });
}

export const cp = copyFile;

export async function rename(src: string, dst: string): Promise<void> {
  // Best-effort: copy then delete. Atomic rename support lands when
  // the hub adds a dedicated grant.
  await copyFile(src, dst);
  await unlink(src);
}

// Default export aggregates everything, mirroring `import fs from 'node:fs/promises'`.
const fsPromisesDefault = {
  readFile,
  writeFile,
  appendFile,
  readdir,
  stat,
  lstat,
  mkdir,
  rm,
  unlink,
  access,
  exists,
  copyFile,
  cp,
  rename,
};

export default fsPromisesDefault;
