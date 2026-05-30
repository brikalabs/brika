/**
 * IPC transport error codes. Cover the host↔plugin wire's resource-governance
 * guards — currently the per-message payload size cap that keeps a misbehaving
 * (or hostile) plugin from OOMing the host with an unbounded message.
 */

import { z } from 'zod';
import { entry, TYPE_BASE } from './_entry';

export const IpcCatalog = {
  /** A WireMessage exceeded the configured per-message payload size cap. */
  IPC_PAYLOAD_TOO_LARGE: entry({
    title: 'IPC payload too large',
    description: 'An IPC message exceeded the configured per-message size cap.',
    typeUri: `${TYPE_BASE}grants/ipc-payload-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Split the message into smaller chunks, stream large binary out-of-band, or ask the operator to raise maxPayloadBytes.',
    data: z.object({
      /** Configured cap, in bytes. */
      limit: z.number().int().positive(),
      /** Approximate measured payload size, in bytes. */
      size: z.number().int().nonnegative(),
      /** 'send' for outbound (host → plugin), 'handle' for inbound. */
      direction: z.enum(['send', 'handle']),
      /** WireMessage type that tripped the cap. */
      messageType: z.string(),
    }),
    message: (data) =>
      `ipc: ${data.direction} payload for "${data.messageType}" is ~${data.size} bytes, over the ${data.limit}-byte cap.`,
  }),
} as const;
