import { group, NotFound, route } from '@brika/router';
import type { Json } from '@brika/shared';
import { z } from 'zod';
import type { BrickInstance } from '@/runtime/bricks/brick-instance-manager';
import type { RegisteredBrickType } from '@/runtime/bricks/brick-type-registry';
import { BrickInstanceManager, BrickTypeRegistry } from '@/runtime/bricks';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';

function toBrickTypeDto(t: RegisteredBrickType) {
  return {
    id: t.fullId,
    localId: t.localId,
    pluginName: t.pluginName,
    name: t.name,
    description: t.description,
    category: t.category,
    icon: t.icon,
    color: t.color,
    families: t.families,
    minSize: t.minSize,
    maxSize: t.maxSize,
    config: t.config,
  };
}

function toBrickInstanceDto(i: BrickInstance) {
  return {
    instanceId: i.instanceId,
    brickTypeId: i.brickTypeId,
    pluginName: i.pluginName,
    w: i.w,
    h: i.h,
    config: i.config,
    body: i.body,
  };
}

export const bricksRoutes = group('/api/bricks', [
  // ─── Brick Types ────────────────────────────────────────────────────────────

  /**
   * List all registered brick types
   */
  route.get('/types', ({ inject }) => {
    return inject(BrickTypeRegistry).list().map(toBrickTypeDto);
  }),

  /**
   * Get a specific brick type by full ID
   */
  route.get(
    '/types/:id',
    { params: z.object({ id: z.string() }) },
    ({ params, inject }) => {
      const t = inject(BrickTypeRegistry).get(params.id);
      if (!t) throw new NotFound('Brick type not found');
      return toBrickTypeDto(t);
    },
  ),

  // ─── Brick Instances ────────────────────────────────────────────────────────

  /**
   * List all active brick instances with their bodies
   */
  route.get('/instances', ({ inject }) => {
    return inject(BrickInstanceManager).list().map(toBrickInstanceDto);
  }),

  /**
   * Get a specific brick instance
   */
  route.get(
    '/instances/:id',
    { params: z.object({ id: z.string() }) },
    ({ params, inject }) => {
      const i = inject(BrickInstanceManager).get(params.id);
      if (!i) throw new NotFound('Brick instance not found');
      return toBrickInstanceDto(i);
    },
  ),

  /**
   * Send an action to a brick instance
   */
  route.post(
    '/instances/:id/action',
    {
      params: z.object({ id: z.string() }),
      body: z.object({
        actionId: z.string(),
        payload: z.unknown().optional(),
      }),
    },
    ({ params, body, inject }) => {
      const instance = inject(BrickInstanceManager).get(params.id);
      if (!instance) throw new NotFound('Brick instance not found');

      const process = inject(PluginLifecycle).getProcess(instance.pluginName);
      if (!process) throw new NotFound('Plugin not running');

      process.sendBrickInstanceAction(
        instance.instanceId,
        instance.brickTypeId,
        body.actionId,
        body.payload as Json,
      );
      return { ok: true };
    },
  ),
]);
