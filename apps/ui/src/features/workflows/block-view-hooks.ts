/**
 * Hooks for client-rendered block views.
 * Exposed to browser-compiled block view modules via globalThis.__brika.blockHooks.
 */

import { useContext } from 'react';
import {
  type BlockVariable,
  BlockViewContext,
  type BlockViewContextValue,
} from './block-view-context';

function useRequiredContext(): BlockViewContextValue {
  const ctx = useContext(BlockViewContext);
  if (!ctx) {
    throw new Error('Block view hook called outside a client-rendered block view');
  }
  return ctx;
}

/** Read the current configuration object for this block instance. */
export function useBlockConfig<T = Record<string, unknown>>(): T {
  return useRequiredContext().config as T;
}

/** Returns a stable callback that merges a partial patch into this block's config. */
export function useUpdateBlockConfig(): (patch: Record<string, unknown>) => void {
  return useRequiredContext().updateConfig;
}

/** The workflow-local instance id of this block. */
export function useBlockId(): string {
  return useRequiredContext().blockId;
}

/** The fully-qualified block type. */
export function useBlockType(): string {
  return useRequiredContext().blockType;
}

/** The block's latest emitted value, streamed live from the running workflow. */
export function useBlockData<T>(): T | undefined {
  return useRequiredContext().data as T | undefined;
}

/** Typed variables from upstream event types, for config autocompletion. */
export function useBlockVariables(): BlockVariable[] {
  return useRequiredContext().variables;
}
