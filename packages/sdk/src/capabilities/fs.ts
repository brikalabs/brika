/**
 * Filesystem capability.
 *
 * The hub-confined surface for files outside the plugin's auto-managed
 * `defineStore` data directory. Most plugins should not need this — the
 * SDK's existing `defineStore` + `readJSON`/`writeJSON` API covers the
 * 90% case (per-plugin JSON state). This capability is for the long tail:
 * plugin-readable static resources, hub-shared scratch space, etc.
 *
 * Scope is a list of allowed path prefixes; the hub canonicalizes paths
 * before checking and rejects anything that escapes via `..` segments.
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

const FsReadArgs = z.object({
  path: z.string().min(1),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
});

const FsReadResult = z.object({
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']),
});

const FsWriteArgs = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
});

const FsExistsArgs = z.object({
  path: z.string().min(1),
});

const FsExistsResult = z.object({
  exists: z.boolean(),
});

const FsPermission = {
  name: 'fs',
  scope: z.object({
    /**
     * Absolute path prefixes the plugin may read/write under. Paths are
     * canonicalized before the prefix check, so `../` escapes are rejected
     * by the hub. Defaults to an empty list (grant exists but allows
     * nothing — explicit declaration required).
     */
    allow: z.array(z.string()).default([]),
  }),
  defaultScope: { allow: [] as string[] },
  icon: 'folder',
} as const;

export const fsRead = defineCapability(
  {
    id: 'fs.read',
    args: FsReadArgs,
    result: FsReadResult,
    description: 'Read a file from an allow-listed directory',
    permission: FsPermission,
  },
  () => {
    throw new Error('fs.read handler is not registered.');
  }
);

export const fsWrite = defineCapability(
  {
    id: 'fs.write',
    args: FsWriteArgs,
    result: z.object({}),
    description: 'Write a file under an allow-listed directory',
    permission: FsPermission,
  },
  () => {
    throw new Error('fs.write handler is not registered.');
  }
);

export const fsExists = defineCapability(
  {
    id: 'fs.exists',
    args: FsExistsArgs,
    result: FsExistsResult,
    description: 'Check whether a path exists',
    permission: FsPermission,
  },
  () => {
    throw new Error('fs.exists handler is not registered.');
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    fs: {
      read(args: z.input<typeof FsReadArgs>): Promise<z.infer<typeof FsReadResult>>;
      write(args: z.input<typeof FsWriteArgs>): Promise<Record<string, never>>;
      exists(args: z.input<typeof FsExistsArgs>): Promise<z.infer<typeof FsExistsResult>>;
    };
  }
}
