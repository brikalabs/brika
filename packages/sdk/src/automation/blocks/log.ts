import { defineBlock, expr, z } from "../block";

export const logBlock = defineBlock(
  {
    type: "log",
    name: "Log",
    icon: "file-text",
    color: "#78716c",
    schema: z.object({
      id: z.string(),
      type: z.literal("log"),
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      message: z.string().describe("Message (supports {{ }})"),
      next: z.string().optional().describe("Next block"),
    }),
  },
  async (config, ctx, runtime) => {
    const message = String(expr(config.message, ctx));
    runtime.log(config.level, message);
    return { next: config.next };
  },
);
