/**
 * `globalThis.__brika_fs` runtime — the bridge the compile-time
 * `node:fs/promises` shim and the runtime `Bun.file` proxy both use.
 *
 * The prelude installs this BEFORE the plugin's bundle starts (not
 * inside `start()`) so plugin module-load code that imports
 * `node:fs/promises` and calls a method synchronously after import is
 * resolved sees a working runtime. The vector arrives later via
 * `start()`; the hub-side scope check is what enforces permissions,
 * so we don't need the vector to be installed for the runtime to work
 * — the hub rejects calls that aren't in scope.
 *
 * The runtime's method signatures live in `@brika/sdk/grants` so the
 * compile-time `node:fs/promises` shim and the hub-side prelude share
 * one declaration. We re-export the type here for ergonomics — the
 * `Bun.file` proxy in this same directory consumes it as a peer.
 */

import type { Channel } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';
import {
  FsExistsResultSchema,
  FsMkdirResultSchema,
  FsReaddirResultSchema,
  FsReadFileResultSchema,
  FsRmResultSchema,
  FsStatResultSchema,
  FsWriteFileResultSchema,
} from '@brika/sdk/grants';
import type { BrikaFsRuntime } from '@brika/sdk/grants/fs-runtime';

export type { BrikaFsRuntime } from '@brika/sdk/grants/fs-runtime';

declare global {
  // eslint-disable-next-line no-var
  var __brika_fs: BrikaFsRuntime | undefined;
}

export interface FsRuntimeDeps {
  readonly channel: Channel;
}

/**
 * Install the runtime on `globalThis.__brika_fs`. Idempotent: a second
 * call replaces the previous installation (useful for tests).
 */
export function installFsRuntime(deps: FsRuntimeDeps): void {
  globalThis.__brika_fs = buildRuntime(deps.channel);
}

function buildRuntime(channel: Channel): BrikaFsRuntime {
  return {
    readFile: (args) => call(channel, 'dev.brika.fs.readFile', args, FsReadFileResultSchema.parse),
    writeFile: (args) =>
      call(channel, 'dev.brika.fs.writeFile', args, FsWriteFileResultSchema.parse),
    readdir: (args) => call(channel, 'dev.brika.fs.readdir', args, FsReaddirResultSchema.parse),
    stat: (args) => call(channel, 'dev.brika.fs.stat', args, FsStatResultSchema.parse),
    mkdir: (args) => call(channel, 'dev.brika.fs.mkdir', args, FsMkdirResultSchema.parse),
    rm: (args) => call(channel, 'dev.brika.fs.rm', args, FsRmResultSchema.parse),
    exists: (args) => call(channel, 'dev.brika.fs.exists', args, FsExistsResultSchema.parse),
  };
}

async function call<R>(
  channel: Channel,
  id: string,
  args: unknown,
  parse: (raw: unknown) => R
): Promise<R> {
  const response = await channel.call(grantRequest, { id, args });
  return parse(response.result);
}
