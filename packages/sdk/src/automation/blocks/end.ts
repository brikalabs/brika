import { defineBlock, z } from "../block";

export const endBlock = defineBlock({
  type: "end",
  name: "End",
  icon: "square",
  color: "#dc2626",
  schema: z.object({
    id: z.string(),
    type: z.literal("end"),
  }),
}, async (_config, _ctx, _runtime) => {
  return { stop: true };
});
