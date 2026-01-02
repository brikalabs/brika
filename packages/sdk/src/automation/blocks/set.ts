import { defineBlock, expr, z } from "../block";

export const setBlock = defineBlock(
  {
    type: "set",
    name: "Set Variable",
    icon: "edit",
    color: "#ec4899",
    schema: z.object({
      id: z.string(),
      type: z.literal("set"),
      var: z.string().describe("Variable name"),
      value: z.any().describe("Value or expression"),
      next: z.string().optional().describe("Next block"),
    }),
  },
  async (config, ctx, _runtime) => {
    const value = expr(config.value, ctx);
    ctx.vars[config.var] = value;
    return { next: config.next, output: value };
  },
);
