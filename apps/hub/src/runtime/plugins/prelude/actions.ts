/**
 * Prelude Actions Module
 *
 * Action handler registry and callAction RPC implementation.
 */

import type { Channel, Json } from '@brika/ipc';
import {
  callAction as callActionRpc,
  registerAction as registerActionMsg,
} from '@brika/ipc/contract';
import { isBinaryResponse, isStreamFileResponse } from '@brika/sdk/actions';

type ActionHandler = (input?: Json) => unknown | Promise<unknown>;

interface SerializedActionError {
  message: string;
  name?: string;
  code?: string;
  data?: Json;
}

/**
 * Turn an unknown thrown value into the wire envelope. Preserves the
 * constructor name and machine-readable code where present (Node errno
 * like `EPERM`, `ENOENT`; or BrikaError codes like
 * `FS_PATH_OUTSIDE_ROOT`) so callers can branch on category instead of
 * pattern-matching the message.
 */
function serializeActionError(err: unknown): SerializedActionError {
  if (err instanceof Error) {
    const out: SerializedActionError = {
      message: err.message || err.toString(),
      name: err.name,
    };
    // Node fs errors carry `code`; BrikaError stores it on the same field.
    // Both surface as a non-enumerable own property, so cast and read.
    const codeCandidate = (err as { code?: unknown }).code;
    if (typeof codeCandidate === 'string') {
      out.code = codeCandidate;
    }
    const dataCandidate = (err as { data?: unknown }).data;
    if (dataCandidate !== undefined && isJson(dataCandidate)) {
      out.data = dataCandidate;
    }
    return out;
  }
  return { message: typeof err === 'string' ? err : String(err) };
}

function isJson(value: unknown): value is Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return true;
  }
  if (typeof value === 'string') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJson);
  }
  if (typeof value === 'object') {
    return Object.values(value).every((v) => v === undefined || isJson(v));
  }
  return false;
}

interface ActionResponse {
  ok: boolean;
  data?: Json;
  bytes?: Uint8Array;
  contentType?: string;
  stream?: { virtualPath: string; contentType?: string };
  error?: SerializedActionError;
}

export function setupActions(channel: Channel) {
  const handlers = new Map<string, ActionHandler>();

  channel.implement(callActionRpc, async ({ actionId, input }): Promise<ActionResponse> => {
    const handler = handlers.get(actionId);
    if (!handler) {
      return {
        ok: false,
        error: {
          message: `Action "${actionId}" not found`,
          name: 'ActionNotFound',
          code: 'ACTION_NOT_FOUND',
        },
      };
    }
    try {
      const result = await handler(input);
      // Streaming envelope from `streamFile()` — bytes never enter
      // the plugin process. The hub resolves `virtualPath` against
      // the plugin's granted fs scope and pipes `Bun.file().stream()`
      // straight to the HTTP response.
      if (isStreamFileResponse(result)) {
        return {
          ok: true,
          stream: { virtualPath: result.virtualPath, contentType: result.contentType },
        };
      }
      // Binary actions return a tagged envelope from `binaryResponse()`.
      // Pass the bytes through Bun's structured-clone IPC; the hub's
      // HTTP route turns them into a raw `Response` with the matching
      // Content-Type, so the page receives a Blob, never base64.
      if (isBinaryResponse(result)) {
        return { ok: true, bytes: result.bytes, contentType: result.contentType };
      }
      return { ok: true, data: result as Json };
    } catch (e) {
      return { ok: false, error: serializeActionError(e) };
    }
  });

  return {
    registerAction(id: string, handler: ActionHandler): void {
      handlers.set(id, handler);
      channel.send(registerActionMsg, { id });
    },
  };
}
