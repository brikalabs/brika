import { z } from "zod";
import { route, group, NotFound } from "@elia/router";
import { AutomationEngine, YamlWorkflowLoader } from "../../automations";

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const connectionSchema = z.object({
  from: z.string(),
  fromPort: z.string().optional(),
  to: z.string(),
  toPort: z.string().optional(),
});

const triggerSchema = z.object({
  event: z.string(),
  filter: z.record(z.string(), z.unknown()).optional(),
});

const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  trigger: triggerSchema,
  blocks: z.array(blockSchema),
  connections: z.array(connectionSchema).optional(),
  enabled: z.boolean().optional(),
});

export const workflowsRoutes = group("/api/workflows", [
  route.get("/", async ({ inject }) => {
    return inject(AutomationEngine).list();
  }),

  route.post("/", { body: workflowSchema }, async ({ body, inject }) => {
    const workflow = {
      ...body,
      trigger: {
        event: body.trigger.event,
        filter: body.trigger.filter as Record<string, import("@elia/shared").Json> | undefined,
      },
      blocks: body.blocks.map((b) => ({
        ...b,
        config: (b.config ?? {}) as Record<string, import("@elia/shared").Json>,
      })),
      connections: body.connections ?? [],
    };
    await inject(YamlWorkflowLoader).saveWorkflow(workflow);
    return { ok: true, id: body.id };
  }),

  route.get("/blocks", async ({ inject }) => {
    return inject(AutomationEngine).getBlockTypes();
  }),

  route.get("/runs", async ({ inject }) => {
    return inject(AutomationEngine).listRuns();
  }),

  route.post(
    "/trigger",
    {
      body: z.object({
        id: z.string(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async ({ body, inject }) => {
      return inject(AutomationEngine).trigger(
        body.id,
        "api.trigger",
        "api",
        (body.payload ?? {}) as import("@elia/shared").Json,
      );
    },
  ),

  route.post("/enable", { body: z.object({ id: z.string() }) }, async ({ body, inject }) => {
    return { ok: inject(AutomationEngine).setEnabled(body.id, true) };
  }),

  route.post("/disable", { body: z.object({ id: z.string() }) }, async ({ body, inject }) => {
    return { ok: inject(AutomationEngine).setEnabled(body.id, false) };
  }),

  route.get("/:id", { params: z.object({ id: z.string() }) }, async ({ params, inject }) => {
    const workflow = inject(AutomationEngine).get(params.id);
    if (!workflow) throw new NotFound("Workflow not found");
    return workflow;
  }),

  route.delete("/:id", { params: z.object({ id: z.string() }) }, async ({ params, inject }) => {
    const ok = await inject(YamlWorkflowLoader).deleteWorkflow(params.id);
    return { ok };
  }),
]);

