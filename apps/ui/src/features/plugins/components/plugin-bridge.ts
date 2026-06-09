/**
 * Plugin Bridge — exposes host modules to plugin brick modules via globalThis.__brika.
 * Heavy deps (icons, ui, cva, clsx) are lazy-loaded with top-level await.
 */

import type { BridgeProp } from '@brika/sdk/browser-bridge';
import { z } from '@brika/sdk/schema';
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
  // Bricks declare `export const config = z.object(...)` and pass it to
  // useBrickConfig(); that schema is built at runtime with this z. It MUST be
  // the SDK's curated z (not raw `zod`): bricks call BRIKA-only helpers like
  // z.dynamicDropdown()/z.generic() at module-eval time, and a raw zod here
  // throws "z.dynamicDropdown is not a function" → "Failed to load brick".
  z,
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

/**
 * Client side of `defineBrickData`: `use()` reads this brick instance's pushed
 * data via the host hook; `set()` is plugin-process-only and never runs here
 * (the brick view only ever calls `use()`).
 */
function defineBrickData<T>(id: string) {
  return {
    id,
    set: () => {
      throw new Error('BrickDataChannel.set() is only available in the plugin process');
    },
    use: () => useBrickData<T>(),
  };
}

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
  brickHooks: { useBrickData, useBrickConfig, useBrickSize, useCallBrickAction, defineBrickData },
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
  // Typed against the shared registry: forgetting to implement a bridged module
  // declared in `@brika/sdk/browser-bridge` is a compile error here.
} satisfies Record<BridgeProp, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __brika: Record<string, unknown> | undefined;
}

globalThis.__brika ??= bridge;
