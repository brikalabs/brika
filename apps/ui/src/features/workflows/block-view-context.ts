import { createContext } from 'react';

/** A typed variable available to a block, derived from upstream event types. */
export interface BlockVariable {
  name: string;
  source: string;
  type: string;
}

/**
 * Per-instance state handed to a client-rendered block view. Mirrors
 * BrickViewContext but for the workflow editor: a block view fully owns its
 * configuration UI, reading and writing the block's config through this context.
 */
export interface BlockViewContextValue {
  /** Workflow-local instance id (the editor node id). */
  blockId: string;
  /** Fully-qualified block type (e.g. "@brika/blocks-builtin:spark-receiver"). */
  blockType: string;
  /** Owning plugin package name. */
  pluginName: string;
  /** Owning plugin process UID. */
  pluginUid: string;
  /** Current configuration object. */
  config: Record<string, unknown>;
  /** Merge a partial patch into the configuration. */
  updateConfig: (patch: Record<string, unknown>) => void;
  /** Typed variables from upstream event types (for config autocompletion). */
  variables: BlockVariable[];
  /** Live runtime data, if any (undefined in the editor). */
  data?: unknown;
}

export const BlockViewContext = createContext<BlockViewContextValue | null>(null);
