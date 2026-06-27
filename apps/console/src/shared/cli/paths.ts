/**
 * Filesystem layout the CLI needs to interact with the running hub.
 *
 * The data dir is resolved by the shared @brika/sdk/exec-context resolver (the
 * single source of truth shared with the hub's brika-context and the lean bin),
 * so the CLI and the hub never disagree about which `.brika` to use. The CLI
 * still does NOT import the hub's brika-context (that pulls in the full runtime);
 * exec-context is a leaf module (node:fs/node:path only).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { isCompiledFrom, resolveDataDir, resolveSystemDir } from '@brika/sdk/exec-context';

export function brikaHome(): string {
  return resolveDataDir({
    env: process.env,
    isCompiled: isCompiledFrom(import.meta.path),
    execPath: process.execPath,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
  }).path;
}

/**
 * The hub-managed `.system` dir under the data dir. Transient supervisor files
 * (the PID file, the local-trust cli-token) live here, alongside everything
 * else the hub owns, so only `brika.yml`/`boards`/`workflows` stay visible.
 */
export function systemDir(): string {
  return resolveSystemDir(brikaHome());
}

export function pidFile(): string {
  return join(systemDir(), 'brika.pid');
}
