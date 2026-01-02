import { defineBlock, expr, z } from "../block";
import type { Json } from "../../types";

export const emitBlock = defineBlock(
  {
    type: "emit",
    name: "Emit",
    icon: "send",
    color: "#10b981",
    schema: z.object({
      id: z.string(),
      type: z.literal("emit"),
      event: z.string().describe("Event type"),
      payload: z.record(z.string(), z.unknown()).optional().describe("Event payload"),
      next: z.string().optional().describe("Next block"),
    }),
  },
  async (config, ctx, runtime) => {
    const payload = expr(config.payload ?? {}, ctx) as Json;
    runtime.emit(config.event, payload);
    return { next: config.next };
  },
);
