import { defineBlock, expr, z } from "../block";

export const switchBlock = defineBlock({
  type: "switch",
  name: "Switch",
  icon: "shuffle",
  color: "#8b5cf6",
  schema: z.object({
    id: z.string(),
    type: z.literal("switch"),
    input: z.string().describe("Value expression"),
    cases: z.record(z.string(), z.string()).describe("Value to block mapping"),
    default: z.string().optional().describe("Default block"),
  }),
}, async (config, ctx, _runtime) => {
  const value = String(expr(config.input, ctx));
  const next = config.cases[value] ?? config.default;
  return { next, output: value };
});
