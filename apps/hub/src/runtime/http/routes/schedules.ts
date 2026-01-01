import { z } from "zod";
import { route, group } from "@elia/router";
import { SchedulerService } from "../../scheduler/scheduler-service";

const scheduleTriggerSchema = z.union([
  z.object({ type: z.literal("cron"), expr: z.string() }),
  z.object({ type: z.literal("interval"), ms: z.number() }),
]);

const createScheduleSchema = z.object({
  name: z.string(),
  trigger: scheduleTriggerSchema,
  action: z.object({
    tool: z.string(),
    args: z.record(z.unknown()),
  }),
  enabled: z.boolean().optional(),
});

export const schedulesRoutes = group("/api/schedules", [
  route.get("/", async ({ inject }) => {
    return inject(SchedulerService).list();
  }),

  route.post("/", { body: createScheduleSchema }, async ({ body, inject }) => {
    return inject(SchedulerService).create(body);
  }),

  route.post(
    "/enable",
    { body: z.object({ id: z.string() }) },
    async ({ body, inject }) => {
      return { ok: await inject(SchedulerService).enable(body.id) };
    },
  ),

  route.post(
    "/disable",
    { body: z.object({ id: z.string() }) },
    async ({ body, inject }) => {
      return { ok: await inject(SchedulerService).disable(body.id) };
    },
  ),

  route.delete(
    "/:id",
    { params: z.object({ id: z.string() }) },
    async ({ params, inject }) => {
      return { ok: await inject(SchedulerService).delete(params.id) };
    },
  ),
]);

