/**
 * Log Block
 *
 * Logs a message.
 */

import { defineBlock, expr, z } from "@elia/sdk";

export const logBlock = defineBlock(
  {
    id: "log",
    name: "Log",
    description: "Log a message",
    category: "utility",
    icon: "file-text",
    color: "#78716c",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      message: z.string().describe("Message to log (supports expressions)"),
      level: z.enum(["debug", "info", "warn", "error"]).optional().describe("Log level"),
    }),
  },
  async (config, ctx, runtime) => {
    const message = String(expr(config.message, ctx));
    const level = config.level ?? "info";
    runtime.log(level, message);
    return { output: "out", data: message };
  },
);
