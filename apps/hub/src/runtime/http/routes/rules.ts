import { z } from "zod";
import { route, group } from "@elia/router";
import { RulesEngine } from "../../rules/rules-engine";

const ruleTriggerSchema = z.union([
  z.object({ type: z.literal("event"), match: z.string() }),
  z.object({ type: z.literal("schedule"), scheduleId: z.string() }),
]);

const ruleActionSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
});

const createRuleSchema = z.object({
  name: z.string(),
  trigger: ruleTriggerSchema,
  condition: z.string().optional(),
  actions: z.array(ruleActionSchema),
  enabled: z.boolean().optional(),
});

export const rulesRoutes = group("/api/rules", [
  route.get("/", async ({ inject }) => {
    return inject(RulesEngine).list();
  }),

  route.post("/", { body: createRuleSchema }, async ({ body, inject }) => {
    return inject(RulesEngine).create(body);
  }),

  route.post(
    "/enable",
    { body: z.object({ id: z.string() }) },
    async ({ body, inject }) => {
      return { ok: await inject(RulesEngine).enable(body.id) };
    },
  ),

  route.post(
    "/disable",
    { body: z.object({ id: z.string() }) },
    async ({ body, inject }) => {
      return { ok: await inject(RulesEngine).disable(body.id) };
    },
  ),

  route.delete(
    "/:id",
    { params: z.object({ id: z.string() }) },
    async ({ params, inject }) => {
      return { ok: await inject(RulesEngine).delete(params.id) };
    },
  ),
]);

