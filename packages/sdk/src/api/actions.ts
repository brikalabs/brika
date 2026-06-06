/**
 * Plugin Actions API
 *
 * Define server-side actions that plugin pages and bricks can call.
 * Action IDs are auto-generated at build time from `hash(filePath:exportName)`
 * — deterministic, order-independent, and collision-resistant.
 *
 * The build system injects IDs automatically. Developers never type or see the ID.
 *
 * @example
 * ```ts
 * // actions.ts (plugin process)
 * import { defineAction } from '@brika/sdk/actions';
 *
 * export const getDevices = defineAction(async () => {
 *   return controller.getDevices();
 * });
 *
 * export const scan = defineAction(async () => {
 *   return controller.discover();
 * });
 * ```
 *
 * ```tsx
 * // pages/devices.tsx (browser — compiled by Bun.build)
 * import { useAction, useCallAction } from '@brika/sdk/ui-kit/hooks';
 * import { getDevices, scan } from '../actions';
 *
 * export default function DevicesPage() {
 *   const callAction = useCallAction();
 *   const { data, loading, refetch } = useAction(getDevices);
 *   return <button onClick={() => callAction(scan).then(refetch)}>Scan</button>;
 * }
 * ```
 */

import { z } from 'zod';
import { getContext } from '../context';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Opaque reference to a server-side action.
 *
 * At runtime this is just `{ __actionId: string }`.
 * The phantom type carries input/output types for compile-time safety.
 */
export interface ActionRef<TInput = void, TOutput = unknown> {
  readonly __actionId: string;
  /** @internal phantom field — never set at runtime */
  readonly __phantom?: {
    input: TInput;
    output: TOutput;
  };
}

// ─── Internal tracking for deferred action refs ──────────────────────────────

type ActionHandler<TInput, TOutput> = (input: TInput) => TOutput | Promise<TOutput>;

const pendingHandlers = new WeakMap<object, (...args: unknown[]) => unknown>();

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Define a server-side action.
 *
 * The build system auto-injects the action ID via `__finalizeActions` at
 * module evaluation time. The developer just writes `defineAction(handler)`.
 *
 * @example
 * ```ts
 * export const getDevices = defineAction(async () => { ... });
 * ```
 */
export function defineAction<TInput = void, TOutput = unknown>(
  handlerOrId: string | ActionHandler<TInput, TOutput>,
  handler?: ActionHandler<TInput, TOutput>
): ActionRef<TInput, TOutput> {
  if (typeof handlerOrId === 'string') {
    // Explicit ID — injected by build system or used in tests
    const id = handlerOrId;
    if (typeof handler !== 'function') {
      throw new TypeError(
        `defineAction('${id}') requires a handler function as the second argument`
      );
    }
    // @ts-expect-error -- generic handler erased to concrete Json type at IPC boundary
    getContext().registerAction(id, handler);
    return { __actionId: id };
  }

  // Deferred: create ref now, finalization assigns the ID later
  const ref = { __actionId: '' } as ActionRef<TInput, TOutput>;
  // @ts-expect-error -- generic handler erased to unknown at WeakMap boundary
  pendingHandlers.set(ref, handlerOrId);
  return ref;
}

// ─── Binary response envelope ────────────────────────────────────────────────

/**
 * Tag used to identify a binary action response across the IPC + HTTP
 * boundary. Hand-rolled (not a Symbol) because the value crosses Bun's
 * structured-clone serializer.
 */
export const BINARY_RESPONSE_TAG = '__brika_binary_response' as const;

/**
 * Binary action response. An action handler returns one of these to
 * signal "respond with raw bytes" — the hub forwards the bytes to the
 * page with the given `contentType` as the HTTP response Content-Type.
 *
 * Page-side, `useCallAction` detects the non-JSON response and returns
 * a `Blob` of the matching MIME type. No base64 in the loop.
 */
export interface BinaryActionResponse {
  readonly [BINARY_RESPONSE_TAG]: true;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/**
 * Build a binary response envelope from raw bytes.
 *
 * The runtime value is the tagged envelope; the declared return type
 * is `Blob` because that's what the **page** receives — `defineAction`
 * uses this type to populate the action ref's phantom output, so
 * `await callAction(readImage, …)` resolves to `Blob` with full type
 * safety. The hub turns the envelope into an HTTP response and
 * `useCallAction` constructs the actual `Blob` from the body.
 *
 * @example
 * ```ts
 * import { binaryResponse, defineAction } from '@brika/sdk/actions';
 * import { readFile } from 'node:fs/promises';
 *
 * export const readImage = defineAction(async ({ path }: { path: string }) => {
 *   return binaryResponse(await readFile(path), 'image/png');
 * });
 * ```
 *
 * Page side:
 * ```ts
 * const blob = await callAction(readImage, { path: '/data/x.png' }); // Blob
 * const url = URL.createObjectURL(blob);
 * ```
 */
export function binaryResponse(bytes: Uint8Array, contentType = 'application/octet-stream'): Blob {
  const envelope: BinaryActionResponse = { [BINARY_RESPONSE_TAG]: true, bytes, contentType };
  return envelope as unknown as Blob;
}

/**
 * Shared guard for "object literal with a `tag: true` marker on it".
 * Both binary + stream envelopes are structurally identical at the
 * tag-check level, so a single zod schema (built per tag) discriminates
 * either one without a hand-rolled typeof/in/index chain.
 */
function hasEnvelopeTag(value: unknown, tag: string): boolean {
  return z.object({ [tag]: z.literal(true) }).safeParse(value).success;
}

export function isBinaryResponse(value: unknown): value is BinaryActionResponse {
  return hasEnvelopeTag(value, BINARY_RESPONSE_TAG);
}

// ─── Stream-file response ────────────────────────────────────────────────────

export const STREAM_FILE_TAG = '__brika_stream_file' as const;

/**
 * Stream-file response. The handler hands the hub a virtual path; the
 * hub resolves it through the plugin's granted fs scope, then pipes
 * `Bun.file(hostPath).stream()` straight from disk into the HTTP
 * response. The bytes never enter the plugin process and never sit
 * buffered in hub memory — only Bun's internal stream chunks (~16 KB)
 * are in flight at a time.
 *
 * Compared to `binaryResponse`, which is buffer-and-forward:
 * `binaryResponse` is the right answer for synthesised payloads
 * (e.g. a thumbnail you compute on the fly); `streamFile` is the
 * right answer for "send a file from disk to the page".
 */
export interface StreamFileResponse {
  readonly [STREAM_FILE_TAG]: true;
  readonly virtualPath: string;
  readonly contentType?: string;
}

/**
 * Build a stream-file envelope. The action handler typically uses this
 * when serving a file the operator has granted the plugin read access
 * to:
 *
 * @example
 * ```ts
 * import { defineAction, streamFile } from '@brika/sdk/actions';
 *
 * export const readEntry = defineAction(async ({ path }: { path: string }) => {
 *   // No `readFile` call — the hub streams the bytes itself.
 *   return streamFile(path, contentTypeFor(path));
 * });
 * ```
 *
 * The return type is `Blob` for the same reason as `binaryResponse`:
 * the page receives a `Blob` via `useCallAction`, and using the
 * Blob phantom output keeps that contract end-to-end type-safe.
 */
export function streamFile(virtualPath: string, contentType?: string): Blob {
  const envelope: StreamFileResponse = {
    [STREAM_FILE_TAG]: true,
    virtualPath,
    contentType,
  };
  return envelope as unknown as Blob;
}

export function isStreamFileResponse(value: unknown): value is StreamFileResponse {
  return hasEnvelopeTag(value, STREAM_FILE_TAG);
}

// ─── Build-time finalization ─────────────────────────────────────────────────

/**
 * Finalize deferred action refs by assigning precomputed IDs and registering handlers.
 *
 * Called automatically by the server build plugin at the end of each action module.
 * NOT part of the public API — the `__` prefix signals internal use.
 *
 * @param ids - Map of `{ exportName: precomputedActionId }` from the build plugin
 * @param exports - Object of `{ exportName: actionRef }` from the module
 */
export function __finalizeActions(
  ids: Record<string, string>,
  exports: Record<string, unknown>
): void {
  for (const [name, ref] of Object.entries(exports)) {
    if (!ref || typeof ref !== 'object') {
      continue;
    }
    const handler = pendingHandlers.get(ref);
    if (!handler) {
      continue;
    }

    const id = ids[name];
    if (!id) {
      continue;
    }
    (ref as { __actionId: string }).__actionId = id;
    // @ts-expect-error -- generic handler erased to concrete Json type at IPC boundary
    getContext().registerAction(id, handler);
    pendingHandlers.delete(ref);
  }
}
