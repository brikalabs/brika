import type { Json } from '@brika/ipc';
import { group, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { getOrThrow } from '../utils/resource-helpers';

type CallResult = Awaited<ReturnType<PluginProcess['callPluginAction']>>;
type StreamEnvelope = NonNullable<CallResult['stream']>;

const actionParams = z.object({
  uid: z.string(),
  actionId: z.string(),
});

const ACTION_META_HEADER = 'x-brika-action-meta';

// Meta arrives base64-encoded (the client encodes UTF-8 JSON so the header
// stays ISO-8859-1 safe — paths may carry non-Latin1 code points such as
// macOS NFD combining marks). Decode, then validate it is a plain object.
const ActionMetaSchema = z.record(z.string(), z.unknown());

function decodeActionMeta(headerValue: string): Record<string, unknown> {
  const json = Buffer.from(headerValue, 'base64').toString('utf8');
  return ActionMetaSchema.parse(JSON.parse(json));
}

/**
 * Decode an action input. The router already parsed JSON bodies; for a
 * binary Content-Type we deliberately do NOT read the body here — the bytes
 * stay in the request so the route can stream them straight to disk when the
 * handler returns a `streamWrite` sink (see `writeStreamResponse`), never
 * buffering them or sending them over the capped IPC channel.
 *
 * The handler instead receives the decoded `X-Brika-Action-Meta` object
 * (e.g. `{ path }`), which the client base64-encodes so the header survives
 * paths with non-Latin1 code points (accents, macOS NFD combining marks).
 */
function readActionInput(req: Request, parsedBody: unknown): Json | undefined {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.startsWith('application/json')) {
    return parsedBody as Json | undefined;
  }
  const metaHeader = req.headers.get(ACTION_META_HEADER);
  if (!metaHeader) {
    return undefined;
  }
  try {
    return decodeActionMeta(metaHeader) as unknown as Json;
  } catch {
    // Malformed header → no input.
    return undefined;
  }
}

/** Build the error response when the action call failed end-to-end. */
function errorResponse(result: CallResult, timing: string): Response {
  const status = result.error?.code === 'ACTION_NOT_FOUND' ? 404 : 500;
  return Response.json(
    { error: result.error ?? { message: 'Action failed' } },
    { status, headers: { 'server-timing': timing } }
  );
}

/**
 * Build a binary response. The `X-Brika-Binary` marker tells the
 * page-side hook to treat the body as a `Blob` — without it, a
 * `.json` file (Content-Type: `application/json`) would collide
 * with the JSON action protocol.
 */
function binaryHttpResponse(
  body: ReadableStream<Uint8Array> | Uint8Array,
  contentType: string | undefined,
  timing: string
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType ?? 'application/octet-stream',
      'x-brika-binary': '1',
      'server-timing': timing,
    },
  });
}

/**
 * Pipe a file from disk straight into the HTTP response. The hub
 * resolves the virtual path against the plugin's granted fs scope
 * (re-using the same validators the `readFile` grant uses); on
 * permission failure we surface a structured 403, on any other
 * failure a 500 — both shaped like the standard action error
 * envelope so the page-side `ActionError` still works.
 */
async function streamResponse(
  process: PluginProcess,
  stream: StreamEnvelope,
  timing: string
): Promise<Response> {
  try {
    const hostPath = await process.resolveStreamPath(stream.virtualPath);
    const file = Bun.file(hostPath);
    return binaryHttpResponse(file.stream(), stream.contentType ?? file.type, timing);
  } catch (err) {
    const envelope = serialiseStreamError(err);
    return Response.json(
      { error: envelope },
      {
        status: envelope.code === 'PERMISSION_DENIED' ? 403 : 500,
        headers: { 'server-timing': timing },
      }
    );
  }
}

/**
 * Stream the request body straight to disk for a `streamWrite` action. The
 * hub resolves the virtual path against the plugin's granted fs scope and
 * runs the full `writeFile` validation pipeline (scope, symlink guard, size
 * cap, quota) — the upload bytes never enter the plugin process or hit the
 * IPC payload cap. Mirrors `streamResponse`'s error shaping (403 on
 * permission failure, 500 otherwise) so the page-side `ActionError` works.
 */
async function writeStreamResponse(
  process: PluginProcess,
  writeStream: { virtualPath: string },
  req: Request,
  timing: string
): Promise<Response> {
  if (!req.body) {
    return Response.json(
      { error: { message: 'Stream-write action requires a request body', code: 'BAD_REQUEST' } },
      { status: 400, headers: { 'server-timing': timing } }
    );
  }
  const lengthHeader = req.headers.get('content-length');
  const declared = lengthHeader === null ? Number.NaN : Number(lengthHeader);
  const declaredBytes = Number.isFinite(declared) ? declared : undefined;
  try {
    const bytesWritten = await process.streamWriteToGrantedPath(
      writeStream.virtualPath,
      req.body,
      declaredBytes
    );
    return Response.json(
      { data: { path: writeStream.virtualPath, bytesWritten } },
      { headers: { 'server-timing': timing } }
    );
  } catch (err) {
    const envelope = serialiseStreamError(err);
    return Response.json(
      { error: envelope },
      {
        status: envelope.code === 'PERMISSION_DENIED' ? 403 : 500,
        headers: { 'server-timing': timing },
      }
    );
  }
}

interface SerialisedError {
  message: string;
  name: string;
  code?: string;
}

/**
 * Shape an unknown thrown value into the same envelope the prelude
 * uses for handler errors, so the page-side `ActionError` sees a
 * uniform structure regardless of where in the chain the failure
 * originated.
 */
function serialiseStreamError(err: unknown): SerialisedError {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      code: readErrorCode(err),
    };
  }
  return { message: String(err), name: 'Error' };
}

/** Pull a string `code` off an Error if it carries one (BrikaError + Node errno). */
function readErrorCode(err: Error): string | undefined {
  if (!('code' in err)) {
    return undefined;
  }
  const value = (err as unknown as Record<string, unknown>).code;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Action endpoint for plugin page → plugin process communication.
 * Pages call `callAction(ref, input)` which POSTs here.
 */
export const actionRoutes = group({
  prefix: '/api/plugins',
  routes: [
    route.post({
      path: '/:uid/actions/:actionId',
      params: actionParams,
      body: z.unknown().optional(),
      handler: async ({ params, body, req, inject }) => {
        const plugin = getOrThrow(inject(PluginManager).get(params.uid), 'Plugin not found');
        const process = inject(PluginLifecycle).getProcess(plugin.name);
        if (!process) {
          throw new NotFound('Plugin not running');
        }

        // For a binary upload the body is left unread: the handler is called
        // with the meta header only (e.g. `{ path }`), and if it returns a
        // `streamWrite` sink the route streams the body straight to disk.
        const input = readActionInput(req, body);

        // Surface the IPC round-trip duration as a Server-Timing entry so
        // an operator can inspect where slowness is coming from straight
        // from the browser Network tab / `curl -i`.
        const start = performance.now();
        const result = await process.callPluginAction(params.actionId, input);
        const timing = `plugin;dur=${(performance.now() - start).toFixed(1)}`;

        if (!result.ok) {
          return errorResponse(result, timing);
        }
        if (result.writeStream) {
          return writeStreamResponse(process, result.writeStream, req, timing);
        }
        if (result.stream) {
          return streamResponse(process, result.stream, timing);
        }
        if (result.bytes) {
          return binaryHttpResponse(result.bytes, result.contentType, timing);
        }
        return Response.json({ data: result.data }, { headers: { 'server-timing': timing } });
      },
    }),
  ],
});
