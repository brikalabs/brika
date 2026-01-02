/**
 * Merge Block
 *
 * Waits for multiple inputs before continuing.
 * All inputs must be received before the block executes.
 */

import { defineBlock, type Json, z } from "@elia/sdk";

export const mergeBlock = defineBlock(
  {
    id: "merge",
    name: "Merge",
    description: "Wait for multiple inputs before continuing",
    category: "flow",
    icon: "git-merge",
    color: "#06b6d4",
    inputs: [
      { id: "a", name: "Input A" },
      { id: "b", name: "Input B" },
    ],
    outputs: [{ id: "out", name: "Output" }],
    schema: z.object({
      mode: z.enum(["all", "any"]).optional().describe("Wait for all inputs or any"),
    }),
  },
  async (config, ctx, runtime) => {
    // Combine all input values
    const merged: Record<string, Json> = { ...ctx.inputs };
    runtime.log("debug", `Merged inputs: ${JSON.stringify(merged)}`);
    return { output: "out", data: merged };
  },
);
