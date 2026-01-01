/**
 * Set Block
 *
 * Sets a workflow variable.
 */

import { defineBlock, expr, type Json, z } from '@elia/sdk'

export const setBlock = defineBlock({
  id: "set",
  name: "Set Variable",
  description: "Set a workflow variable",
  category: "data",
  icon: "edit",
  color: "#ec4899",
  inputs: [{ id: "in", name: "Input" }],
  outputs: [{ id: "out", name: "Output" }],
  schema: z.object({
    var: z.string().describe("Variable name to set"),
    value: z.unknown().describe("Value to assign (can use expressions)"),
  }),
}, async (config, ctx, runtime) => {
  const value = expr(config.value, ctx) as Json;
  runtime.log("debug", `Setting variable: ${config.var} = ${JSON.stringify(value)}`);
  runtime.setVar(config.var, value);
  return { output: "out", data: value };
});

