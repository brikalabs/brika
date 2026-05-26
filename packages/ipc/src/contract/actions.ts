/**
 * Actions Contract
 *
 * Plugin-defined server-side actions: registration and invocation.
 */

import { z } from 'zod';
import { message, rpc } from '../define';
import { Json } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers an action with the hub */
export const registerAction = message(
  'registerAction',
  z.object({
    id: z.string(),
  })
);

/**
 * Hub calls an action on the plugin.
 *
 * On success the plugin returns either a JSON payload `{ ok: true, data }`
 * or a binary payload `{ ok: true, bytes, contentType }`. The binary
 * variant lets the page receive a raw `Blob` over the HTTP boundary
 * without ever round-tripping through base64.
 *
 * On failure it returns `{ ok: false, error }` where `error` is a
 * structured envelope:
 *   - `message`: human-readable text (always present)
 *   - `name`:    constructor name of the thrown value (e.g. `Error`,
 *                `TypeError`, `BrikaError`)
 *   - `code`:    optional machine-readable code (Node errno like
 *                `EPERM` / `ENOENT`, or a `BrikaError` code like
 *                `FS_PATH_OUTSIDE_ROOT`). Lets the UI branch on
 *                category instead of pattern-matching the message.
 *   - `data`:    optional structured context (`BrikaError.data`).
 */
export const callAction = rpc(
  'callAction',
  z.object({
    actionId: z.string(),
    input: Json.optional(),
  }),
  z.object({
    ok: z.boolean(),
    data: Json.optional(),
    /**
     * Raw bytes for binary responses; transported via Bun's advanced IPC.
     * Typed with `z.custom` to keep the inferred TS type as the wider
     * `Uint8Array` (and not the stricter `Uint8Array<ArrayBuffer>` that
     * `z.instanceof` yields) — handlers often produce Buffers which are
     * `Uint8Array<ArrayBufferLike>`.
     */
    bytes: z.custom<Uint8Array>((v) => v instanceof Uint8Array).optional(),
    /** MIME type that the hub will set on the HTTP response. */
    contentType: z.string().optional(),
    /**
     * Stream-file directive: the action handler asks the hub to pipe
     * a file from disk straight to the HTTP response. The hub
     * resolves `virtualPath` through the plugin's granted fs scope,
     * then streams `Bun.file(hostPath).stream()` — no buffering of
     * the bytes anywhere. The `contentType` (if provided) becomes
     * the response's `Content-Type`; otherwise the hub falls back
     * to `application/octet-stream`.
     */
    stream: z
      .object({
        virtualPath: z.string(),
        contentType: z.string().optional(),
      })
      .optional(),
    error: z
      .object({
        message: z.string(),
        name: z.string().optional(),
        code: z.string().optional(),
        data: Json.optional(),
      })
      .optional(),
  })
);
