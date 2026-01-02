/**
 * Switch Block
 *
 * Multi-way branch based on a value.
 */

import { defineBlock, z } from "@elia/sdk";

export const switchBlock = defineBlock(
  {
    id: "switch",
    name: "Switch",
    description: "Multi-way branch based on a value",
    category: "flow",
    icon: "shuffle",
    color: "#8b5cf6",
    inputs: [{ id: "in", name: "Input" }],
    outputs: [
      { id: "default", name: "Default" },
      // Dynamic outputs are added based on cases
    ],
    schema: z.object({
      value: z.string().describe("Expression to evaluate (e.g., trigger.payload.status)"),
      cases: z.record(z.string(), z.string()).describe("Map of value -> output port ID"),
    }),
  },
  async (config, ctx, runtime) => {
    const value = String(runtime.evaluate(config.value, ctx));
    runtime.log("debug", `Switch value: ${value}`);

    // Find matching case
    const outputPort = config.cases[value] ?? "default";
    return {
      output: outputPort,
      data: value,
    };
  },
);
