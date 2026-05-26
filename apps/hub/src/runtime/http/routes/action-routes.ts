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

/**
 * Decode an action input. The router already parsed JSON bodies; for
 * any other Content-Type we pull the raw bytes and forward them as a
 * `Uint8Array` so plugin handlers can accept binary input natively.
 *
 * When the caller attaches an `X-Brika-Action-Meta` header (JSON), we
 * merge it with the binary body so the handler sees a single object:
 * `{ ...meta, body: <bytes> }`. This is how `writeEntry({ path }, file)`
 * stays base64-free — `path` rides the header, bytes ride the body.
 */
async function readActionInput(req: Request, parsedBody: unknown): Promise<Json | undefined> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.startsWith('application/json')) {
    return parsedBody as Json | undefined;
  }
  if (!contentType) {
    return undefined;
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  const metaHeader = req.headers.get(ACTION_META_HEADER);
  if (!metaHeader) {
    return bytes as unknown as Json;
  }
  let meta: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(metaHeader);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed header → ignore, treat as pure binary.
  }
  return { ...meta, body: bytes } as unknown as Json;
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
      code: (err as { code?: string }).code,
    };
  }
  return { message: String(err), name: 'Error' };
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

        // Binary input: the router only parses JSON, so for any other
        // Content-Type we pull the raw bytes ourselves and pass them
        // through as a Uint8Array. Bun's structured-clone IPC carries
        // them straight to the plugin handler — no base64 in the loop.
        const input = await readActionInput(req, body);

        // Surface the IPC round-trip duration as a Server-Timing entry so
        // an operator can inspect where slowness is coming from straight
        // from the browser Network tab / `curl -i`.
        const start = performance.now();
        const result = await process.callPluginAction(params.actionId, input);
        const timing = `plugin;dur=${(performance.now() - start).toFixed(1)}`;

        if (!result.ok) {
          return errorResponse(result, timing);
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
