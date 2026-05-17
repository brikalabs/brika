/**
 * Filesystem layout the CLI needs to interact with the running hub.
 *
 * The CLI deliberately does NOT import `@/runtime/context/brika-context`
 * (that lives inside the hub binary and pulls in the full runtime).
 * Instead we resolve the same convention here so the CLI stays lean:
 *
 *   - `$BRIKA_HOME` if set
 *   - else compiled mode: parent of the install directory
 *   - else dev mode: climb from cwd to the workspace root (the
 *     ancestor `package.json` with a `workspaces` field) and use its
 *     `.brika`. This lets `bun run dev:hot` from `apps/console/` share
 *     the data dir mortar spawned the hub with. Falls back to
 *     `<cwd>/.brika` outside any workspace.
 *
 * Keep this in sync with `apps/hub/src/runtime/context/brika-context.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const isCompiled = import.meta.path.startsWith('/$bunfs/');
const installDir = dirname(process.execPath);

export function brikaHome(): string {
  const fromEnv = process.env.BRIKA_HOME;
  if (fromEnv) {
    return fromEnv;
  }
  if (isCompiled) {
    return dirname(installDir);
  }
  return join(findWorkspaceRoot() ?? process.cwd(), '.brika');
}

/**
 * Walk up from cwd looking for a `package.json` with a `workspaces`
 * field — the bun/npm/yarn monorepo root. Safety-capped at 12 levels.
 */
function findWorkspaceRoot(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 12; i += 1) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(pkg, 'utf8'));
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'workspaces' in parsed &&
          parsed.workspaces !== undefined
        ) {
          return dir;
        }
      } catch {
        // Malformed package.json — keep climbing.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
  return undefined;
}

export function pidFile(): string {
  return join(brikaHome(), 'brika.pid');
}
