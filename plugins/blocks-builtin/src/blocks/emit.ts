/**
 * Emit Block
 *
 * Emits an event to the event bus.
 */

import { defineBlock, expr, type Json, z } from "@elia/sdk";

export const emitBlock = defineBlock(
  {
    id: "emit",
    name: "Emit Event",
    description: "Emit an event to the event bus",
    category: "actions",
    icon: "send",
    color: "#10b981",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      event: z.string().describe("Event type to emit"),
      payload: z.record(z.string(), z.unknown()).optional().describe("Event payload"),
    }),
  },
  async (config, ctx, runtime) => {
    const payload = expr(config.payload ?? {}, ctx) as Json;
    runtime.log("debug", `Emitting event: ${config.event}`);
    runtime.emit(config.event, payload);
    return { output: "out", data: { event: config.event, payload } };
  },
);
