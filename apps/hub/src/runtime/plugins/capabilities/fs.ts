/**
 * Hub-side handlers for the `fs.*` capability.
 *
 * Implements path-prefix containment: every requested path is canonicalized
 * with `path.resolve` and then checked against the granted prefix list. A
 * `../` segment that resolves outside the allow list is rejected.
 */

import { existsSync, promises as fs } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { defineCapability } from '@brika/capabilities';
import {
  fsExists as existsSpec,
  fsRead as readSpec,
  fsWrite as writeSpec,
} from '@brika/sdk/capabilities';

/**
 * Maximum size returned by a single `fs.read` call. A plugin reading a
 * giant file should not be able to OOM the hub — the handler stats the
 * file first and rejects when it exceeds this cap. Tune via the capability
 * scope later if a legitimate use case appears; for now, hard-coded.
 */
const MAX_READ_BYTES = 10 * 1024 * 1024; // 10 MB

interface FsScope {
  allow: ReadonlyArray<string>;
}

/**
 * True iff `target` (after canonicalization) is equal to or nested under
 * one of the allowed roots. Each allowed root is itself resolved.
 */
export function isPathAllowed(target: string, allow: ReadonlyArray<string>): boolean {
  if (!isAbsolute(target)) {
    return false;
  }
  const canonicalTarget = resolve(target);
  for (const root of allow) {
    if (!isAbsolute(root)) {
      continue;
    }
    const canonicalRoot = resolve(root);
    if (canonicalTarget === canonicalRoot || canonicalTarget.startsWith(canonicalRoot + sep)) {
      return true;
    }
  }
  return false;
}

function enforce(scope: FsScope, path: string, op: string): void {
  if (!isPathAllowed(path, scope.allow)) {
    throw new Error(
      `fs.${op}: path "${path}" is not inside this plugin's allow list (${scope.allow.join(', ') || '(empty)'})`
    );
  }
}

export interface FsCallbacks {
  // Currently no per-plugin hooks needed — the hub uses node:fs directly.
}

export function buildFsCapabilities(_cb: FsCallbacks) {
  return [
    defineCapability(readSpec.spec, async (ctx, args) => {
      const scope = ctx.grantedScope as FsScope;
      enforce(scope, args.path, 'read');
      // Stat first so a giant file can't OOM the hub — the call rejects
      // before any bytes hit memory.
      const stat = await fs.stat(args.path);
      if (stat.size > MAX_READ_BYTES) {
        throw new Error(
          `fs.read: file "${args.path}" is ${stat.size} bytes; cap is ${MAX_READ_BYTES}. Read in chunks or use a smaller file.`
        );
      }
      const buf = await fs.readFile(args.path);
      return {
        content: args.encoding === 'base64' ? buf.toString('base64') : buf.toString('utf-8'),
        encoding: args.encoding,
      };
    }),
    defineCapability(writeSpec.spec, async (ctx, args) => {
      const scope = ctx.grantedScope as FsScope;
      enforce(scope, args.path, 'write');
      const data =
        args.encoding === 'base64'
          ? Buffer.from(args.content, 'base64')
          : Buffer.from(args.content, 'utf-8');
      await fs.writeFile(args.path, data);
      return {};
    }),
    defineCapability(existsSpec.spec, (ctx, args) => {
      const scope = ctx.grantedScope as FsScope;
      enforce(scope, args.path, 'exists');
      return { exists: existsSync(args.path) };
    }),
  ];
}
