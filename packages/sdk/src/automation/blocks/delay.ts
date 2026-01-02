import { defineBlock, parseDuration, z } from "../block";

export const delayBlock = defineBlock(
  {
    type: "delay",
    name: "Delay",
    icon: "clock",
    color: "#6b7280",
    schema: z.object({
      id: z.string(),
      type: z.literal("delay"),
      duration: z.union([z.string(), z.number()]).describe("Duration (5s, 1m, 5000)"),
      next: z.string().optional().describe("Next block"),
    }),
  },
  async (config, _ctx, runtime) => {
    const ms = parseDuration(config.duration);
    runtime.log("debug", `Delay: ${ms}ms`);
    await new Promise((r) => setTimeout(r, ms));
    return { next: config.next };
  },
);
