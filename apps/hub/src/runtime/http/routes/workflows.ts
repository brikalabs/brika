import { z } from "zod";
import { route, group, NotFound, BadRequest } from "@elia/router";
import { AutomationEngine, YamlWorkflowLoader } from "../../automations";

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  config: z.record(z.unknown()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const connectionSchema = z.object({
  from: z.object({ block: z.string(), output: z.string().optional() }),
  to: z.object({ block: z.string(), input: z.string().optional() }),
});

const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  trigger: z.record(z.unknown()).optional(),
  blocks: z.array(blockSchema),
  connections: z.array(connectionSchema).optional(),
  enabled: z.boolean().optional(),
});

export const workflowsRoutes = group("/api/workflows", [
  route.get("/", async ({ inject }) => {
    return inject(AutomationEngine).list();
  }),

  route.post("/", { body: workflowSchema }, async ({ body, inject }) => {
    await inject(YamlWorkflowLoader).saveWorkflow(body);
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
        payload: z.record(z.unknown()).optional(),
      }),
    },
    async ({ body, inject }) => {
      return inject(AutomationEngine).trigger(
        body.id,
        "api.trigger",
        "api",
        body.payload ?? {},
      );
    },
  ),

  route.post(
    "/enable",
    { body: z.object({ id: z.string() }) },
    async ({ body, inject }) => {
      return { ok: inject(AutomationEngine).setEnabled(body.id, true) };
    },
  ),

  route.post(
    "/disable",
    { body: z.object({ id: z.string() }) },
    async ({ body, inject }) => {
      return { ok: inject(AutomationEngine).setEnabled(body.id, false) };
    },
  ),

  route.get(
    "/:id",
    { params: z.object({ id: z.string() }) },
    async ({ params, inject }) => {
      const workflow = inject(AutomationEngine).get(params.id);
      if (!workflow) throw new NotFound("Workflow not found");
      return workflow;
    },
  ),

  route.delete(
    "/:id",
    { params: z.object({ id: z.string() }) },
    async ({ params, inject }) => {
      const ok = await inject(YamlWorkflowLoader).deleteWorkflow(params.id);
      return { ok };
    },
  ),
]);

