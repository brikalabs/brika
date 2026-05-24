/**
 * Scope checks for `ctx.fs.*` calls.
 *
 * Pattern grammar (v0):
 *   - literal:   `/data/state.json` matches exactly
 *   - tail glob: `/data/**` matches the literal `/data` and anything
 *     beneath it (`/data/x`, `/data/sub/x`, …)
 *
 * Anything fancier (`/data/*\/foo`, `?` placeholders, brace expansion)
 * lands in a later phase along with `picomatch`. The two forms above
 * cover every authoring pattern we've seen in practice.
 *
 * Bundle (`/bundle/**`) is implicitly readable by every plugin: the
 * plugin's own install dir is its bundle, and forcing every manifest
 * to declare a read-self permission would be ceremony with no payoff.
 * Writes to `/bundle` are always denied regardless of scope.
 */

import { errors } from '@brika/errors';
import type { FsScope } from '@brika/sdk/grants';
import type { ResolvedPath } from './types';

export type FsAccessKind = 'read' | 'write';

/**
 * Assert the plugin's scope permits `kind` access to `resolved.virtualPath`.
 * Throws `PERMISSION_DENIED` when denied. Writes to `/bundle` always
 * throw — the backing dir is meant to be immutable.
 */
export function assertAccess(resolved: ResolvedPath, scope: FsScope, kind: FsAccessKind): void {
  if (kind === 'write' && resolved.readOnly) {
    throw errors.permissionDenied({
      permission: `fs:write:${resolved.virtualPath}`,
    });
  }
  // Ephemeral `/user/<token>` paths require an explicit `/user/**`
  // read pattern in scope — NOT the implicit /bundle bypass below.
  // The user's pick is consent for THAT file; the scope is consent
  // for the plugin to accept user picks at all.
  if (resolved.isEphemeral) {
    if (kind === 'write') {
      throw errors.permissionDenied({
        permission: `fs:write:${resolved.virtualPath}`,
      });
    }
    if (!matchesAny('/user/__', scope.read) && !matchesAny('/user/__', scope.write)) {
      throw errors.permissionDenied({
        permission: 'fs:read:/user/**',
      });
    }
    return;
  }
  // /bundle is implicitly readable. Skip the pattern check.
  if (kind === 'read' && resolved.root === '/bundle') {
    return;
  }
  const list = kind === 'read' ? scope.read : scope.write;
  // Write implies read, so a path covered by `write` also passes a read
  // check. Without this, plugins would have to declare every write
  // path twice.
  const writeList = scope.write;
  if (matchesAny(resolved.virtualPath, list)) {
    return;
  }
  if (kind === 'read' && matchesAny(resolved.virtualPath, writeList)) {
    return;
  }
  throw errors.permissionDenied({
    permission: `fs:${kind}:${resolved.virtualPath}`,
  });
}

export function matchesAny(virtualPath: string, patterns: ReadonlyArray<string>): boolean {
  for (const pattern of patterns) {
    if (matches(virtualPath, pattern)) {
      return true;
    }
  }
  return false;
}

export function matches(virtualPath: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return virtualPath === prefix || virtualPath.startsWith(`${prefix}/`);
  }
  return virtualPath === pattern;
}
