/**
 * `ctx.fs.*` — hub-mediated filesystem access via virtual roots.
 *
 * Plugins never see absolute host paths. Every path crossing IPC starts
 * with one of:
 *   - `/bundle`  — the plugin's own install dir, read-only
 *   - `/data`    — the plugin's persistent data dir, rw
 *   - `/cache`   — the plugin's cache dir, rw (hub may evict)
 *   - `/tmp`     — per-process temp dir, rw (cleared on restart)
 *
 * The hub maps each root to a real host directory. The plugin's
 * `fs:read` / `fs:write` scope lists virtual-path patterns; any path
 * that escapes the virtual root after normalisation (or via a
 * symlink) is rejected.
 *
 * v0 ships read/write/list/stat/mkdir/rm/exists. Streaming reads,
 * file watching, and `chmod`-class operations are deliberately out of
 * scope — plugins move to that surface area in v2.
 */

import { defineGrant, type PermissionGate } from '@brika/grants';
import { z } from 'zod';
import type { BrikaFsRuntime } from './fs-runtime';

export type { BrikaFsRuntime } from './fs-runtime';

// ─── Virtual-root constants ─────────────────────────────────────────────────

/** Known virtual root names. Anything outside this set is a path error. */
export const VIRTUAL_ROOTS = ['/bundle', '/data', '/cache', '/tmp'] as const;
export type VirtualRoot = (typeof VIRTUAL_ROOTS)[number];

// ─── Path schema ────────────────────────────────────────────────────────────

/**
 * A virtual path: starts with a known root, no `..` segments, no
 * embedded NUL bytes. The hub performs deeper normalisation; this
 * just rejects the obvious-wrong inputs at the wire boundary.
 */
export const FsPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => !p.includes('\0'), { error: 'path contains NUL byte' });

export type FsPath = z.infer<typeof FsPathSchema>;

// ─── Scope ──────────────────────────────────────────────────────────────────

/**
 * A pattern in an fs scope. Two forms supported in v0:
 *   - literal:       `/data/state.json`
 *   - suffix glob:   `/data/**`  (matches everything under /data/)
 * Wider patterns land in a later phase once we add picomatch.
 */
export const FsPatternSchema = z.string().min(1).max(512);

export const FsScopeSchema = z.object({
  /** Patterns the plugin may read. */
  read: z.array(FsPatternSchema).default([]),
  /** Patterns the plugin may write (implies read for the same path). */
  write: z.array(FsPatternSchema).default([]),
});

export type FsScope = z.infer<typeof FsScopeSchema>;

const FsPermission: PermissionGate<typeof FsScopeSchema> = {
  name: 'fs',
  scope: FsScopeSchema,
  defaultScope: { read: [], write: [] },
  icon: 'folder',
};

// ─── readFile ───────────────────────────────────────────────────────────────

export const FsReadFileArgsSchema = z.object({
  path: FsPathSchema,
  /** Encoding controls whether `content` comes back as `string` or `Uint8Array`. */
  encoding: z.enum(['utf-8', 'binary']).default('utf-8'),
});

export const FsReadFileResultSchema = z.discriminatedUnion('encoding', [
  z.object({ encoding: z.literal('utf-8'), content: z.string() }),
  z.object({ encoding: z.literal('binary'), content: z.instanceof(Uint8Array) }),
]);

export type FsReadFileArgs = z.infer<typeof FsReadFileArgsSchema>;
export type FsReadFileResult = z.infer<typeof FsReadFileResultSchema>;

export const fsReadFile = defineGrant(
  {
    id: 'dev.brika.fs.readFile',
    args: FsReadFileArgsSchema,
    result: FsReadFileResultSchema,
    permission: FsPermission,
    description: "Read a file from one of the plugin's virtual roots.",
    redact: {
      args: (args) => ({ path: args.path, encoding: args.encoding }),
      result: (result) => ({
        encoding: result.encoding,
        bytes: result.encoding === 'utf-8' ? result.content.length : result.content.byteLength,
      }),
    },
  },
  () => {
    throw new Error('fs.readFile: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── writeFile ──────────────────────────────────────────────────────────────

/**
 * Wire-level cap on a single writeFile payload. The hub's per-call
 * `maxFileBytes` (default 50 MiB) is the security boundary; this 64
 * MiB ceiling is a defence-in-depth so a malicious plugin can't
 * force the IPC decode to allocate gigabytes before the cap check
 * runs.
 */
const MAX_WRITE_BYTES = 64 * 1024 * 1024;

export const FsWriteFileArgsSchema = z.object({
  path: FsPathSchema,
  content: z.union([
    z.string().max(MAX_WRITE_BYTES),
    z.instanceof(Uint8Array).refine((b) => b.byteLength <= MAX_WRITE_BYTES, {
      error: `content exceeds the wire-level ${MAX_WRITE_BYTES}-byte cap`,
    }),
  ]),
  /**
   * `overwrite` (default) replaces the file; `append` adds to the end;
   * `create-new` fails with `FS_ALREADY_EXISTS` if the file exists.
   */
  mode: z.enum(['overwrite', 'append', 'create-new']).default('overwrite'),
});

export const FsWriteFileResultSchema = z.object({
  bytesWritten: z.number().int().nonnegative(),
});

export type FsWriteFileArgs = z.infer<typeof FsWriteFileArgsSchema>;
export type FsWriteFileResult = z.infer<typeof FsWriteFileResultSchema>;

export const fsWriteFile = defineGrant(
  {
    id: 'dev.brika.fs.writeFile',
    args: FsWriteFileArgsSchema,
    result: FsWriteFileResultSchema,
    permission: FsPermission,
    description: "Write a file to one of the plugin's virtual roots.",
    redact: {
      args: (args) => ({
        path: args.path,
        mode: args.mode,
        bytes: typeof args.content === 'string' ? args.content.length : args.content.byteLength,
      }),
    },
  },
  () => {
    throw new Error('fs.writeFile: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── readdir ────────────────────────────────────────────────────────────────

export const FsDirEntrySchema = z.object({
  name: z.string(),
  isFile: z.boolean(),
  isDirectory: z.boolean(),
  isSymlink: z.boolean(),
});

export const FsReaddirArgsSchema = z.object({
  path: FsPathSchema,
  recursive: z.boolean().default(false),
});

export const FsReaddirResultSchema = z.object({
  entries: z.array(FsDirEntrySchema),
});

export type FsDirEntry = z.infer<typeof FsDirEntrySchema>;
export type FsReaddirArgs = z.infer<typeof FsReaddirArgsSchema>;
export type FsReaddirResult = z.infer<typeof FsReaddirResultSchema>;

export const fsReaddir = defineGrant(
  {
    id: 'dev.brika.fs.readdir',
    args: FsReaddirArgsSchema,
    result: FsReaddirResultSchema,
    permission: FsPermission,
    description: 'List the entries of a directory.',
    redact: {
      result: (result) => ({ entryCount: result.entries.length }),
    },
  },
  () => {
    throw new Error('fs.readdir: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── stat ───────────────────────────────────────────────────────────────────

export const FsStatArgsSchema = z.object({ path: FsPathSchema });

export const FsStatResultSchema = z.object({
  size: z.number().int().nonnegative(),
  mtimeMs: z.number().int(),
  isFile: z.boolean(),
  isDirectory: z.boolean(),
  isSymlink: z.boolean(),
});

export type FsStatArgs = z.infer<typeof FsStatArgsSchema>;
export type FsStatResult = z.infer<typeof FsStatResultSchema>;

export const fsStat = defineGrant(
  {
    id: 'dev.brika.fs.stat',
    args: FsStatArgsSchema,
    result: FsStatResultSchema,
    permission: FsPermission,
    description: "Inspect a file or directory's metadata.",
  },
  () => {
    throw new Error('fs.stat: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── mkdir ──────────────────────────────────────────────────────────────────

export const FsMkdirArgsSchema = z.object({
  path: FsPathSchema,
  recursive: z.boolean().default(false),
});

export const FsMkdirResultSchema = z.object({
  created: z.boolean(),
});

export type FsMkdirArgs = z.infer<typeof FsMkdirArgsSchema>;
export type FsMkdirResult = z.infer<typeof FsMkdirResultSchema>;

export const fsMkdir = defineGrant(
  {
    id: 'dev.brika.fs.mkdir',
    args: FsMkdirArgsSchema,
    result: FsMkdirResultSchema,
    permission: FsPermission,
    description: "Create a directory inside one of the plugin's virtual roots.",
  },
  () => {
    throw new Error('fs.mkdir: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── rm ─────────────────────────────────────────────────────────────────────

export const FsRmArgsSchema = z.object({
  path: FsPathSchema,
  recursive: z.boolean().default(false),
  force: z.boolean().default(false),
});

export const FsRmResultSchema = z.object({
  removed: z.boolean(),
});

export type FsRmArgs = z.infer<typeof FsRmArgsSchema>;
export type FsRmResult = z.infer<typeof FsRmResultSchema>;

export const fsRm = defineGrant(
  {
    id: 'dev.brika.fs.rm',
    args: FsRmArgsSchema,
    result: FsRmResultSchema,
    permission: FsPermission,
    description: "Remove a file or directory inside the plugin's virtual roots.",
  },
  () => {
    throw new Error('fs.rm: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── exists ─────────────────────────────────────────────────────────────────

export const FsExistsArgsSchema = z.object({ path: FsPathSchema });

export const FsExistsResultSchema = z.object({
  exists: z.boolean(),
});

export type FsExistsArgs = z.infer<typeof FsExistsArgsSchema>;
export type FsExistsResult = z.infer<typeof FsExistsResultSchema>;

export const fsExists = defineGrant(
  {
    id: 'dev.brika.fs.exists',
    args: FsExistsArgsSchema,
    result: FsExistsResultSchema,
    permission: FsPermission,
    description: 'Check whether a path exists.',
  },
  () => {
    throw new Error('fs.exists: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── ctx augmentation ───────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    fs: BrikaFsRuntime;
  }
}
