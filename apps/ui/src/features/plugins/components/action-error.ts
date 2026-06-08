/**
 * Pure helpers around the plugin-action error contract.
 *
 * Extracted from `plugin-hooks.ts` so they can be unit-tested without
 * a React renderer or the host's i18n / toast machinery in scope. The
 * hooks file re-imports them and stays the public surface for plugin
 * pages and bricks.
 */

import { toast } from '@brika/clay';

const APPLICATION_JSON = 'application/json';
const OCTET_STREAM = 'application/octet-stream';

const ACTION_META_HEADER = 'x-brika-action-meta';

/**
 * Marker the hub emits on responses that carry raw binary bytes (the
 * handler used `binaryResponse(...)` / `streamFile(...)`). The actual
 * MIME stays on `Content-Type` so the browser uses the right viewer;
 * this header is the protocol bit — without it we'd misclassify a
 * JSON file's bytes as a JSON action result and return `undefined`.
 */
const BRIKA_BINARY_HEADER = 'x-brika-binary';

/**
 * Thrown / returned by the action hooks when the server returns a
 * non-2xx response. Wraps the structured envelope (`message`, `name`,
 * `code`, `data`) from the wire contract so callers can branch on
 * `.code` — e.g. `if (err.code === 'EPERM') ...`.
 */
export class ActionError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly originalName?: string;
  readonly data?: unknown;

  constructor(
    message: string,
    init: { status: number; code?: string; originalName?: string; data?: unknown }
  ) {
    super(message);
    this.name = 'ActionError';
    this.status = init.status;
    this.code = init.code;
    this.originalName = init.originalName;
    this.data = init.data;
  }

  /** Build an `ActionError` from an unknown thrown value (e.g. network failure). */
  static fromUnknown(err: unknown, status = 0): ActionError {
    if (err instanceof ActionError) {
      return err;
    }
    if (err instanceof Error) {
      return new ActionError(err.message, { status, originalName: err.name });
    }
    return new ActionError(typeof err === 'string' ? err : String(err), { status });
  }
}

export interface ActionErrorBody {
  error?:
    | string
    | {
        message?: string;
        name?: string;
        code?: string;
        data?: unknown;
      };
}

/** Convert a hub response body + status into a typed `ActionError`. */
export function parseActionError(body: ActionErrorBody, status: number): ActionError {
  const envelope = body.error;
  if (typeof envelope === 'string') {
    return new ActionError(envelope, { status });
  }
  const message = envelope?.message ?? `Action failed (${status})`;
  return new ActionError(message, {
    status,
    code: envelope?.code,
    originalName: envelope?.name,
    data: envelope?.data,
  });
}

export interface UseActionOptions {
  /**
   * Auto-show a toast when the request fails. Default: `true`. Set to
   * `false` if the caller is rendering the error inline.
   */
  toastOnError?: boolean;
  /**
   * Custom error handler. Receives the parsed `ActionError`. Suppresses
   * the default toast unless it returns `true` to chain through.
   */
  onError?: (err: ActionError) => boolean | void;
  /**
   * JSON metadata to attach when the input is binary (Blob / File /
   * Uint8Array / ArrayBuffer). Travels in the `X-Brika-Action-Meta`
   * header; the hub merges it into the action input as
   * `{ ...meta, body: <bytes> }` before invoking the handler.
   *
   * Use this for "binary payload with a few scalar fields" actions
   * like `writeEntry({ path }, file)` — the path lands in `meta`, the
   * bytes are the raw body, no base64 anywhere.
   */
  meta?: Record<string, unknown>;
}

/**
 * Default toast for an `ActionError`. Title comes from the original
 * error name (or "Action failed" for generic / Brika-typed errors),
 * body from the human-readable message.
 */
function toastActionError(err: ActionError): void {
  const title =
    err.originalName === 'BrikaError' || !err.originalName ? 'Action failed' : err.originalName;
  toast.error(title, { description: err.message });
}

/**
 * Dispatch an `ActionError` to the user-facing surfaces. Honours the
 * caller's per-call opts: `onError` runs first and can suppress the
 * toast by returning anything other than `true`; otherwise the
 * default toast fires unless `toastOnError === false`.
 */
export function handleActionError(err: ActionError, opts: UseActionOptions | undefined): void {
  let shouldToast = opts?.toastOnError !== false;
  if (opts?.onError) {
    const chain = opts.onError(err);
    if (chain !== true) {
      shouldToast = false;
    }
  }
  if (shouldToast) {
    toastActionError(err);
  }
}

export interface EncodedActionInput {
  body: BodyInit | undefined;
  contentType: string | undefined;
}

/**
 * Pick the wire encoding for an action input.
 *
 * Binary inputs (`Blob` / `File` / `Uint8Array` / `ArrayBuffer`) are
 * always sent as `application/octet-stream`, regardless of the file's
 * own MIME. The Content-Type header is the protocol channel — a
 * `.json` File reporting `application/json` would collide with the
 * JSON action protocol and the hub would try to parse the file's
 * contents as the action input. The original MIME isn't needed on
 * the wire: writeEntry stores bytes; readEntry already re-derives
 * MIME from the extension at read time.
 *
 * Plain JSON inputs go as `application/json`.
 */
export function encodeActionInput(input: unknown): EncodedActionInput {
  if (input === undefined) {
    return { body: undefined, contentType: undefined };
  }
  // `Blob`/`File` pass through zero-copy. This is the common case
  // (playground uploads `File`s straight from the input element).
  if (input instanceof Blob) {
    return { body: input, contentType: OCTET_STREAM };
  }
  if (input instanceof ArrayBuffer) {
    return {
      body: new Blob([input], { type: OCTET_STREAM }),
      contentType: OCTET_STREAM,
    };
  }
  // `Uint8Array` is a rare path (programmatic byte payloads). DOM's
  // `BlobPart` wants `Uint8Array<ArrayBuffer>` but Bun's runtime
  // hands back `Uint8Array<ArrayBufferLike>` — bridge the variance
  // by copying into a fresh ArrayBuffer-backed view. One copy on
  // this path only; the common Blob/File branch above stays zero-copy.
  if (input instanceof Uint8Array) {
    const buffer = new ArrayBuffer(input.byteLength);
    new Uint8Array(buffer).set(input);
    return {
      body: new Blob([buffer], { type: OCTET_STREAM }),
      contentType: OCTET_STREAM,
    };
  }
  return { body: JSON.stringify(input), contentType: APPLICATION_JSON };
}

/**
 * Encode action meta for the `X-Brika-Action-Meta` header. Header values are
 * a ByteString (ISO-8859-1), but a file path can carry code points outside
 * Latin-1: accents, smart quotes, CJK, emoji, or macOS NFD combining marks
 * (e.g. "développeur" arrives as `développeur`). Base64 of the UTF-8
 * bytes keeps the header transmissible; the hub decodes it in
 * `readActionInput`.
 */
export function encodeMetaHeader(meta: Record<string, unknown>): string {
  const utf8 = new TextEncoder().encode(JSON.stringify(meta));
  let binary = '';
  for (const byte of utf8) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export { ACTION_META_HEADER, APPLICATION_JSON, BRIKA_BINARY_HEADER, OCTET_STREAM };
