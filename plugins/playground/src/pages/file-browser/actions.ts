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
 * Binary I/O uses `binaryResponse(...)` (response side) and `Uint8Array`
 * inputs (request side) so bytes cross the action boundary natively.
 * No base64 in the loop.
 */

import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { defineAction, streamFile } from '@brika/sdk/actions';
import { assertUnderData } from '../../paths';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  html: 'text/html; charset=utf-8',
};

function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface FsEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

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
    await rm(input.path);
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
 * Write a file. Bytes ride the raw POST body; path comes via the
 * `X-Brika-Action-Meta` header. Plugin process receives the merged
 * `{ path, body: Uint8Array }` envelope — see `readActionInput` in
 * the hub's action route.
 */
export const writeEntry = defineAction(
  async (input: {
    path: string;
    body: Uint8Array;
  }): Promise<{ path: string; bytesWritten: number }> => {
    assertUnderData(input.path);
    await writeFile(input.path, input.body);
    return { path: input.path, bytesWritten: input.body.byteLength };
  }
);
