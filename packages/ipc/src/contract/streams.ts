/**
 * Hub → plugin streaming protocol.
 *
 * The grant-request RPC handles synchronous request/response calls. For
 * stateful streams (WebSocket today, EventSource and file watches
 * later) the hub also needs to push events at the plugin: data frames,
 * close notifications, errors. Those flow through one `streamEvent`
 * message tagged with the stream's handle id so the plugin's stream
 * dispatcher can route them to the right listener.
 */

import { z } from 'zod';
import { message } from '../define';

export const StreamEventKindSchema = z.enum(['open', 'message', 'close', 'error']);
export type StreamEventKind = z.infer<typeof StreamEventKindSchema>;

/**
 * Discriminated by `kind`:
 *   - `open`     emitted once the stream is established (informational)
 *   - `message`  inbound frame; `data` is `string | Uint8Array`
 *   - `close`    stream ended; `code` and `reason` follow ws semantics
 *   - `error`    upstream error; `message` is the descriptive text
 *
 * Wire shape uses a union over discriminators rather than separate
 * messages so the prelude dispatcher needs only one handler.
 */
export const StreamEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('open'),
    handleId: z.string(),
  }),
  z.object({
    kind: z.literal('message'),
    handleId: z.string(),
    data: z.union([z.string(), z.instanceof(Uint8Array)]),
  }),
  z.object({
    kind: z.literal('close'),
    handleId: z.string(),
    code: z.number().int(),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal('error'),
    handleId: z.string(),
    message: z.string(),
  }),
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;

/** Hub → plugin message. The plugin's prelude attaches `channel.on(streamEvent, ...)`. */
export const streamEvent = message('stream.event', StreamEventSchema);
