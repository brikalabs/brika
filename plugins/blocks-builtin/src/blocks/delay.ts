/**
 * Delay Block
 *
 * Waits for a specified duration before continuing.
 */

import { defineBlock, parseDuration, z } from "@elia/sdk";

export const delayBlock = defineBlock(
  {
    id: "delay",
    name: "Delay",
    description: "Wait for a duration before continuing",
    category: "flow",
    icon: "timer",
    color: "#6b7280",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      duration: z.union([z.string(), z.number()]).describe("Duration to wait (e.g., '5s', '1m', 5000)"),
    }),
  },
  async (config, ctx, runtime) => {
    const ms = parseDuration(config.duration);
    runtime.log("debug", `Waiting for ${ms}ms`);

    await new Promise((resolve) => setTimeout(resolve, ms));

    return { output: "out", data: ctx.input };
  },
);
