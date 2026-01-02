import { defineBlock, expr, z } from "../block";

export const actionBlock = defineBlock(
  {
    type: "action",
    name: "Action",
    icon: "zap",
    color: "#3b82f6",
    schema: z.object({
      id: z.string(),
      type: z.literal("action"),
      tool: z.string().describe("Tool to call"),
      args: z.record(z.string(), z.unknown()).optional().describe("Arguments"),
      next: z.string().optional().describe("Next block"),
    }),
  },
  async (config, ctx, runtime) => {
    const args = expr(config.args ?? {}, ctx);
    runtime.log("debug", `Action: ${config.tool}`);
    const result = await runtime.callTool(config.tool, args);
    return { next: config.next, output: result };
  },
);
