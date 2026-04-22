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
  return {
    path,
    to: ((...args: unknown[]) =>
      resolvePath(path, args[0] as Record<string, string> | undefined)) as RoutePath<T>['to'],
  };
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
  store: {
    list: route('/store'),
    detail: route('/store/$source/$'),
  },
  settings: {
    index: route('/settings'),
    themes: route('/settings/themes'),
  },
};
