/**
 * Plugin Bridge — exposes host modules to plugin brick modules via globalThis.__brika.
 * Heavy deps (icons, ui, cva, clsx) are lazy-loaded with top-level await.
 */

import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {
  useBrickConfig,
  useBrickData,
  useBrickSize,
  useCallBrickAction,
} from '@/features/boards/brick-view-hooks';
import {
  usePluginAction as useAction,
  useCallAction,
  usePluginLocale as useLocale,
} from './plugin-hooks';

const [icons, ui, cva, { clsx: clsxFn }] = await Promise.all([
  import('lucide-react'),
  import('@/components/ui'),
  import('class-variance-authority'),
  import('clsx'),
]);

// Wrap clsx without mutating the original module export
const clsxWrapper = Object.assign((...args: Parameters<typeof clsxFn>) => clsxFn(...args), {
  clsx: clsxFn,
});

const bridge = {
  React,
  jsx: {
    ...jsxRuntime,
    jsxDEV(type: React.ElementType, props: object, key: React.Key | undefined, isStatic: boolean) {
      return isStatic ? jsxRuntime.jsxs(type, props, key) : jsxRuntime.jsx(type, props, key);
    },
  },
  hooks: { useLocale, useAction, useCallAction },
  brickHooks: { useBrickData, useBrickConfig, useBrickSize, useCallBrickAction },
  icons,
  ui,
  cva,
  clsx: clsxWrapper,
};

declare global {
  // eslint-disable-next-line no-var
  var __brika: Record<string, unknown> | undefined;
}

globalThis.__brika ??= bridge;
