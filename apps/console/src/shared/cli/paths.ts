/**
 * Filesystem layout the CLI needs to interact with the running hub.
 *
 * The data dir is resolved by the shared @brika/sdk/exec-context resolver (the
 * single source of truth shared with the hub's brika-context and the lean bin),
 * so the CLI and the hub never disagree about which `.brika` to use. The CLI
 * still does NOT import the hub's brika-context (that pulls in the full runtime);
 * exec-context is a leaf module (node:fs/node:path only).
 */

import { join } from 'node:path';
import { isCompiledFrom, resolveDataDir } from '@brika/sdk/exec-context';

export function brikaHome(): string {
  return resolveDataDir({
    env: process.env,
    isCompiled: isCompiledFrom(import.meta.path),
    execPath: process.execPath,
    cwd: process.cwd(),
  }).path;
}

export function pidFile(): string {
  return join(brikaHome(), 'brika.pid');
}
