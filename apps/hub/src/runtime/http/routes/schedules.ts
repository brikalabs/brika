import { group, route } from '@brika/router';
import { Json } from '@brika/shared';
import { z } from 'zod';
import { SchedulerService } from '@/runtime/scheduler/scheduler-service';

const scheduleTriggerSchema = z.union([
  z.object({ type: z.literal('cron'), expr: z.string() }),
  z.object({ type: z.literal('interval'), ms: z.number() }),
]);

const createScheduleSchema = z.object({
  name: z.string(),
  trigger: scheduleTriggerSchema,
  action: z.object({
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  enabled: z.boolean().default(true),
});

export const schedulesRoutes = group('/api/schedules', [
  route.get('/', ({ inject }) => {
    return inject(SchedulerService).list();
  }),

  route.post('/', { body: createScheduleSchema }, ({ body, inject }) => {
    return inject(SchedulerService).create({
      ...body,
      action: {
        tool: body.action.tool,
        args: body.action.args as Record<string, Json>,
      },
    });
  }),

  route.post('/enable', { body: z.object({ id: z.string() }) }, async ({ body, inject }) => {
    return { ok: await inject(SchedulerService).enable(body.id) };
  }),

  route.post('/disable', { body: z.object({ id: z.string() }) }, async ({ body, inject }) => {
    return { ok: await inject(SchedulerService).disable(body.id) };
  }),

  route.delete('/:id', { params: z.object({ id: z.string() }) }, async ({ params, inject }) => {
    return { ok: await inject(SchedulerService).delete(params.id) };
  }),
]);
