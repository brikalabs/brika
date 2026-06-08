/**
 * Plugin actions — typed plugin-page → plugin-process calls.
 *
 * Uses the standard `node:fs/promises` API directly. The plugin compiler
 * rewrites those imports to a shim that routes every call through the
 * grant runtime, so the read/write goes through the same scope, symlink,
 * and sandbox layers a `ctx.fs.*` call would. The shim throws
 * `PERMISSION_DENIED` if the matching `dev.brika.fs.*` grant is missing —
 * there is no ambient fs access.
 *
 * Binary I/O:
 *  - **Read** (`readEntry`) uses `streamFile(...)` — the handler hands
 *    the hub a virtual path and the hub pipes `Bun.file().stream()`
 *    straight into the HTTP response. No bytes ever sit buffered.
 *  - **Write** (`writeEntry`) returns a `streamWrite(...)` sink — the
 *    handler hands the hub a virtual path (the bytes ride the raw POST
 *    body, the path comes via the `X-Brika-Action-Meta` header) and the
 *    hub streams the body straight to disk. No bytes enter the plugin
 *    process, no IPC payload cap, no base64.
 */

import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { defineAction, streamFile, streamWrite } from '@brika/sdk/actions';
import { assertUnderData } from '../../paths';
import { contentTypeFor } from './lib/content-types';
import type { FsEntry } from './types';

export const listEntries = defineAction(
  async (input: { path: string }): Promise<{ path: string; entries: FsEntry[] }> => {
    assertUnderData(input.path);
    const names = await readdir(input.path);
    const entries = await Promise.all(
      names.map(async (name): Promise<FsEntry> => {
        const s = await stat(`${input.path}/${name}`);
        return {
          name,
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          size: s.isFile() ? s.size : 0,
          mtime: Math.floor(s.mtimeMs),
        };
      })
    );
    return { path: input.path, entries };
  }
);

export const makeFolder = defineAction(
  async (input: { path: string }): Promise<{ path: string }> => {
    assertUnderData(input.path);
    await mkdir(input.path, { recursive: true });
    return { path: input.path };
  }
);

export const deleteEntry = defineAction(
  async (input: { path: string }): Promise<{ path: string; deleted: true }> => {
    assertUnderData(input.path);
    // `recursive` so a folder (empty or not) deletes cleanly. Without it Bun's
    // rm refuses a directory and surfaces a cryptic `EFAULT: bad address`
    // rather than removing it; files are unaffected either way.
    await rm(input.path, { recursive: true });
    return { path: input.path, deleted: true };
  }
);

/**
 * Read a file as a streaming response. The handler does NOT read the
 * bytes — it hands the hub a `streamFile(...)` envelope, and the hub
 * pipes `Bun.file(hostPath).stream()` straight into the HTTP response
 * after validating the path against the plugin's granted fs scope.
 * No bytes ever sit buffered in the plugin process or in hub memory,
 * which is what keeps RAM flat even on repeated 100 MB previews.
 */
export const readEntry = defineAction((input: { path: string }) => {
  assertUnderData(input.path);
  return streamFile(input.path, contentTypeFor(input.path));
});

/**
 * Write a file. The path comes via the `X-Brika-Action-Meta` header; the
 * bytes ride the raw POST body. Returning `streamWrite(path)` asks the hub
 * to stream that body straight to disk (overwrite) under the plugin's
 * granted fs scope — the bytes never enter the plugin process or hit the
 * IPC payload cap, so uploads scale to the fs grant's file-size limit. The
 * hub replies to the page with `{ path, bytesWritten }`.
 */
export const writeEntry = defineAction((input: { path: string }) => {
  assertUnderData(input.path);
  return streamWrite(input.path);
});
