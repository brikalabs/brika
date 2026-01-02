/**
 * Parallel Block
 *
 * Activates multiple outputs in parallel.
 */

import { defineBlock, z } from "@elia/sdk";

export const parallelBlock = defineBlock(
  {
    id: "parallel",
    name: "Parallel",
    description: "Run multiple branches in parallel",
    category: "flow",
    icon: "git-fork",
    color: "#a855f7",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [
      { id: "a", name: "Branch A" },
      { id: "b", name: "Branch B" },
    ],
    schema: z.object({
      // No config needed - just splits to all outputs
    }),
  },
  async (config, ctx, runtime) => {
    runtime.log("debug", "Splitting to parallel branches");
    // Return all outputs - the executor will handle running them in parallel
    return { output: "a", data: ctx.input }; // Note: executor handles multi-output
  },
);
