/**
 * Plugin Bridge — exposes host modules to plugin brick modules via globalThis.__brika.
 * Heavy deps (icons, ui, cva, clsx) are lazy-loaded with top-level await.
 */

import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { analyticsApi } from '@/features/analytics/api';
import {
  useBrickConfig,
  useBrickData,
  useBrickSize,
  useCallBrickAction,
} from '@/features/boards/brick-view-hooks';
import {
  useBlockConfig,
  useBlockData,
  useBlockId,
  useBlockType,
  useBlockVariables,
  useUpdateBlockConfig,
} from '@/features/workflows/block-view-hooks';
import type { Json } from '@/types';
import {
  usePluginAction as useAction,
  useCallAction,
  usePluginLocale as useLocale,
  usePluginRouteUrl,
  usePluginUid,
} from './plugin-hooks';

/** Client-safe subset of @brika/sdk for browser-compiled plugin modules. */
const sdk = {
  capture: (name: string, props?: Record<string, Json>) => analyticsApi.capture(name, props),
};

const [icons, ui, cva, { clsx: clsxFn }] = await Promise.all([
  import('lucide-react'),
  import('@brika/clay'),
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
    // Signature is dictated by React's automatic JSX dev runtime, which calls
    // `jsxDEV(type, props, key, isStaticChildren, source, self)` positionally.
    // The 4th arg (`isStaticChildren`) is read from `rest` rather than as a
    // typed boolean parameter: this is a single runtime entrypoint that can't
    // be split into separate methods.
    jsxDEV(type: React.ElementType, props: object, key: React.Key | undefined, ...rest: unknown[]) {
      const isStaticChildren = rest[0] === true;
      return isStaticChildren
        ? jsxRuntime.jsxs(type, props, key)
        : jsxRuntime.jsx(type, props, key);
    },
  },
  sdk,
  hooks: { useLocale, useAction, useCallAction, usePluginUid, usePluginRouteUrl },
  brickHooks: { useBrickData, useBrickConfig, useBrickSize, useCallBrickAction },
  blockHooks: {
    useBlockConfig,
    useUpdateBlockConfig,
    useBlockId,
    useBlockType,
    useBlockData,
    useBlockVariables,
  },
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
