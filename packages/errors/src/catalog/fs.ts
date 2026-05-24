/**
 * `ctx.fs.*` error codes. Cover virtual-root resolution, symlink
 * escape detection, quotas, per-call size caps, existence checks.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const FsCatalog = {
  /**
   * Path doesn't start with a known virtual root (`/bundle`, `/data`,
   * `/cache`, `/tmp`), or normalised away from one (`..` segment).
   */
  FS_PATH_OUTSIDE_ROOT: entry({
    title: 'Filesystem path outside virtual root',
    description: "A path didn't resolve to one of the plugin's virtual roots.",
    typeUri: `${TYPE_BASE}grants/fs-path-outside-root`,
    status: 400,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Use one of /bundle, /data, /cache, /tmp. Absolute host paths and `..` escapes are rejected.',
    data: z.object({ path: z.string() }),
    message: (data) => `fs: path "${data.path}" is outside the plugin's virtual roots.`,
  }),
  /**
   * A symlink target escaped the backing host directory after realpath.
   */
  FS_SYMLINK_ESCAPE: entry({
    title: 'Filesystem symlink escape',
    description: "A symlink resolved to a path outside the plugin's backing directory.",
    typeUri: `${TYPE_BASE}grants/fs-symlink-escape`,
    status: 400,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The path passed virtual-root checks but its realpath escaped the backing dir. This is almost always a malicious symlink — investigate.',
    data: z.object({ path: z.string() }),
    publicDataShape: z.object({ path: z.string() }),
    message: (data) => `fs: symlink target for "${data.path}" escapes the plugin sandbox.`,
  }),
  /** Per-plugin disk quota for the root would be exceeded by this op. */
  FS_QUOTA_EXCEEDED: entry({
    title: 'Filesystem quota exceeded',
    description: "The plugin's quota for the target root would be exceeded.",
    typeUri: `${TYPE_BASE}grants/fs-quota-exceeded`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Reduce file size, clean up old files, or ask the operator to raise the per-plugin quota for this root.',
    data: z.object({
      root: z.string(),
      limit: z.number().int().nonnegative(),
      requested: z.number().int().nonnegative(),
    }),
    message: (data) =>
      `fs: quota for "${data.root}" would be exceeded (${data.requested} > ${data.limit} bytes).`,
  }),
  /** Single readFile / writeFile crossed the per-op size cap. */
  FS_FILE_TOO_LARGE: entry({
    title: 'Filesystem file too large',
    description: 'A single file operation exceeded the per-call size cap.',
    typeUri: `${TYPE_BASE}grants/fs-file-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Chunked reads / writes will land in v2. For now, split large files into segments under the per-call cap.',
    data: z.object({
      limit: z.number().int().positive(),
      requested: z.number().int().nonnegative(),
    }),
    message: (data) => `fs: file size ${data.requested} exceeds per-call cap ${data.limit}.`,
  }),
  /** `create-new` mode hit an existing file. */
  FS_ALREADY_EXISTS: entry({
    title: 'Filesystem path already exists',
    description: 'A `create-new` write found an existing file at the path.',
    typeUri: `${TYPE_BASE}grants/fs-already-exists`,
    status: 409,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({ path: z.string() }),
    message: (data) => `fs: "${data.path}" already exists.`,
  }),
  /** Target path doesn't exist for an op that requires it. */
  FS_NOT_FOUND: entry({
    title: 'Filesystem path not found',
    description: "An fs operation targeted a path that doesn't exist.",
    typeUri: `${TYPE_BASE}grants/fs-not-found`,
    status: 404,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({ path: z.string() }),
    message: (data) => `fs: "${data.path}" not found.`,
  }),
} as const;
