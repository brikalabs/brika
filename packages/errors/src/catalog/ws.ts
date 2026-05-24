/**
 * `ctx.ws.*` error codes. Cover the WebSocket grant family's
 * per-plugin caps and handle bookkeeping.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const WsCatalog = {
  /** Plugin opened more concurrent WebSocket connections than allowed. */
  WS_OPEN_LIMIT_EXCEEDED: entry({
    title: 'WebSocket open limit exceeded',
    description:
      'The plugin has reached the per-plugin maximum for simultaneously-open WebSocket connections.',
    typeUri: `${TYPE_BASE}grants/ws-open-limit-exceeded`,
    status: 429,
    severity: 'error',
    category: 'grants',
    retryable: true,
    transient: true,
    developerHint:
      'Close an existing WebSocket before opening another, or ask the operator to raise the per-plugin cap.',
    data: z.object({ limit: z.number().int().positive() }),
    message: (data) => `ws: per-plugin open-socket limit (${data.limit}) reached.`,
  }),
  /** Plugin referenced a handleId that isn't (or no longer is) registered. */
  WS_HANDLE_NOT_FOUND: entry({
    title: 'WebSocket handle not found',
    description: 'Plugin used a WebSocket handle that is closed or unknown.',
    typeUri: `${TYPE_BASE}grants/ws-handle-not-found`,
    status: 404,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({ handleId: z.string() }),
    message: (data) => `ws: handle "${data.handleId}" is not open.`,
  }),
  /** Plugin tried to send a frame larger than the per-call cap. */
  WS_FRAME_TOO_LARGE: entry({
    title: 'WebSocket frame too large',
    description: 'An outbound frame exceeded the per-call size cap.',
    typeUri: `${TYPE_BASE}grants/ws-frame-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({
      limit: z.number().int().positive(),
      requested: z.number().int().nonnegative(),
    }),
    message: (data) => `ws: frame size ${data.requested} exceeds per-call cap ${data.limit}.`,
  }),
} as const;
