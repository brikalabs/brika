/**
 * End Block
 *
 * Terminates a workflow branch.
 */

import { defineBlock, z } from "@elia/sdk";

export const endBlock = defineBlock(
  {
    id: "end",
    name: "End",
    description: "End the workflow branch",
    category: "flow",
    icon: "square",
    color: "#dc2626",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [], // No outputs - terminal block
    schema: z.object({
      status: z.enum(["success", "failure"]).optional().describe("End status"),
      message: z.string().optional().describe("Optional message"),
    }),
  },
  async (config, ctx, runtime) => {
    const status = config.status ?? "success";
    runtime.log("debug", `Workflow ended with status: ${status}`);
    return {
      stop: true,
      data: {
        status,
        message: config.message,
        finalInput: ctx.input,
      },
    };
  },
);
