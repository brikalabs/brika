/**
 * Echo Plugin - Simple example with type-safe Zod tools
 */

import { defineTool, log, onStop, z } from "@brika/sdk";

export const echo = defineTool(
  {
    id: "echo",
    description: "Echo back the provided message",
    schema: z.object({
      message: z.string().describe("The message to echo back"),
    }),
  },
  async (args) => {
    log("info", "echo", { message: args.message });
    return { ok: true, content: args.message };
  },
);

onStop(() => {
  log("info", "stopping");
});

log("info", "Echo plugin loaded");
