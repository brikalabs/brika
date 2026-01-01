import { defineBlock, expr, z } from "../block";

export const conditionBlock = defineBlock({
  type: "condition",
  name: "Condition",
  icon: "git-branch",
  color: "#f59e0b",
  schema: z.object({
    id: z.string(),
    type: z.literal("condition"),
    if: z.string().describe("Condition expression"),
    then: z.string().describe("Block if true"),
    else: z.string().optional().describe("Block if false"),
  }),
}, async (config, ctx, _runtime) => {
  const result = Boolean(expr(config.if, ctx));
  return { next: result ? config.then : config.else, output: result };
});
