/**
 * Route path constants and helpers for navigation.
 *
 * Components should import from here instead of '@/routes'
 * to avoid circular dependencies with the lazy-loaded route tree.
 */

import { type ParamsArg, resolvePath } from '@brika/auth/tanstack';

// ─── Route path entry ───────────────────────────────────────────────────────

interface RoutePath<T extends string> {
  readonly path: T;
  to(...args: ParamsArg<T>): string;
}

function route<const T extends string>(path: T): RoutePath<T> {
  const to: RoutePath<T>['to'] = (...args: unknown[]) =>
    resolvePath(path, args[0] as Record<string, string> | undefined);
  return { path, to };
}

// ─── Route paths ────────────────────────────────────────────────────────────

export const paths = {
  dashboard: {
    index: route('/'),
  },
  blocks: {
    blocks: route('/blocks'),
  },
  plugins: {
    list: route('/plugins'),
    detail: route('/plugins/$uid'),
    overview: route('/plugins/$uid'),
    tab: route('/plugins/$uid/$tab'),
  },
  workflows: {
    list: route('/workflows'),
    new: route('/workflows/new'),
    edit: route('/workflows/$id/edit'),
  },
  boards: {
    list: route('/boards'),
    detail: route('/boards/$boardId'),
  },
  sparks: {
    list: route('/sparks'),
    tab: route('/sparks/$tab'),
  },
  tools: {
    list: route('/tools'),
  },
  analytics: {
    list: route('/analytics'),
    tab: route('/analytics/$tab'),
  },
  store: {
    list: route('/store'),
    detail: route('/store/$source/$'),
  },
  settings: {
    index: route('/settings'),
    appearance: route('/settings/appearance'),
    language: route('/settings/language'),
    time: route('/settings/time'),
    location: route('/settings/location'),
    hub: route('/settings/hub'),
    registry: route('/settings/registry'),
    remoteAccess: route('/settings/remote-access'),
    system: route('/settings/system'),
    themes: route('/settings/themes'),
  },
  help: {
    concepts: route('/help/concepts'),
  },
};
