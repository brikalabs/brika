/**
 * Condition Block
 *
 * Branches based on a condition expression.
 */

import { defineBlock, z } from '@elia/sdk'

export const conditionBlock = defineBlock({
  id: "condition",
  name: "Condition",
  description: "Branch based on a condition",
  category: "flow",
  icon: "git-branch",
  color: "#f59e0b",
  inputs: [{ id: "in", name: "Input" }],
  outputs: [
    { id: "then", name: "Then", type: "boolean" },
    { id: "else", name: "Else", type: "boolean" },
  ],
  schema: z.object({
    if: z.string().describe("Condition expression (e.g., trigger.payload.value > 10)"),
  }),
}, async (config, ctx, runtime) => {
  const result = Boolean(runtime.evaluate(config.if, ctx));
  runtime.log("debug", `Condition "${config.if}" evaluated to: ${result}`);
  return {
    output: result ? "then" : "else",
    data: result,
  };
});

