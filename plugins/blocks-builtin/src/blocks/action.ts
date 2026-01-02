/**
 * Action Block
 *
 * Calls a registered tool with arguments.
 */

import { defineBlock, expr, z } from "@elia/sdk";

export const actionBlock = defineBlock(
  {
    id: "action",
    name: "Action",
    description: "Call a tool with arguments",
    category: "actions",
    icon: "zap",
    color: "#3b82f6",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      tool: z.string().describe("Tool name to call"),
      args: z.record(z.string(), z.unknown()).optional().describe("Arguments to pass"),
    }),
  },
  async (config, ctx, runtime) => {
    const args = expr(config.args ?? {}, ctx);
    runtime.log("debug", `Calling tool: ${config.tool}`);
    const result = await runtime.callTool(config.tool, args as Record<string, never>);
    return { output: "out", data: result };
  },
);
