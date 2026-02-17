import type { InjectionToken } from '@brika/di';
import { group, route } from '@brika/router';
import { z } from 'zod';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { getOrThrow } from '../utils/resource-helpers';

const pageParams = z.object({ uid: z.string(), pageId: z.string() });

type Inject = <T>(token: InjectionToken<T>) => T;

function resolveModuleTypeId(inject: Inject, uid: string, pageId: string) {
  const plugin = getOrThrow(inject(PluginManager).get(uid), 'Plugin not found');
  return `${plugin.name}:${pageId}`;
}

export const pageRoutes = group('/api/plugins/:uid/pages/:pageId', [
  route.get('/module.js', { params: pageParams }, ({ params, inject }) => {
    const code = inject(ModuleCompiler).get(resolveModuleTypeId(inject, params.uid, params.pageId));
    if (!code) return new Response('Page not found', { status: 404 });

    return new Response(code, {
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=60' },
    });
  }),
]);
