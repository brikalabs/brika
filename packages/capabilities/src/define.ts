import type { z } from 'zod';
import type { Capability, CapabilityHandler, CapabilitySpec } from './types';

/**
 * Define a capability.
 *
 * @example always-on capability (no permission gate)
 * ```ts
 * export const getDeviceLocation = defineCapability(
 *   {
 *     id: 'location.get',
 *     args: z.object({}),
 *     result: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
 *   },
 *   async (ctx) => readHubLocation(ctx),
 * );
 * ```
 *
 * @example capability gated by a scoped permission
 * ```ts
 * export const netFetch = defineCapability(
 *   {
 *     id: 'net.fetch',
 *     args: z.object({ url: z.string().url(), method: z.string().optional() }),
 *     result: z.object({ status: z.number(), body: z.string() }),
 *     permission: {
 *       name: 'net',
 *       scope: z.object({ allow: z.array(z.string()).default([]) }),
 *       defaultScope: { allow: [] },
 *       icon: 'globe',
 *     },
 *     description: 'Make HTTP requests to allowed hosts',
 *   },
 *   async (ctx, args) => {
 *     // ctx.grantedScope is typed { allow: string[] }
 *     enforceHostAllowlist(args.url, ctx.grantedScope.allow);
 *     return doFetch(args);
 *   },
 * );
 * ```
 */
export function defineCapability<
  I extends z.ZodType,
  O extends z.ZodType,
  S extends z.ZodType = z.ZodVoid,
>(spec: CapabilitySpec<I, O, S>, handler: CapabilityHandler<I, O, S>): Capability<I, O, S> {
  return { spec, handler };
}
