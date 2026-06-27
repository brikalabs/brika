/**
 * Block System Types
 *
 * Core types for block metadata and registration.
 */

import type { Json } from '../types';

// Re-export Serializable for convenience
export type { Serializable } from '@brika/serializable';

// ─────────────────────────────────────────────────────────────────────────────
// Ports - Input/Output connection points
// ─────────────────────────────────────────────────────────────────────────────

/** Port direction */
export type PortDirection = 'input' | 'output';

/**
 * A typed connection point on a block.
 */
export interface BlockPort {
  id: string;
  /** Display name for UI */
  name: string;
  direction: PortDirection;
  /** Structural type descriptor from @brika/type-system (JSON-serializable) */
  type?: Record<string, unknown>;
  /** JSON Schema for this port (undefined for generic/passthrough) */
  jsonSchema?: Record<string, unknown>;
  /**
   * When set, this output is a template repeated once per item of the named
   * config array (e.g. `cases`), producing ports `<id>-<index>` in the editor.
   */
  dynamic?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Schema (for config)
// ─────────────────────────────────────────────────────────────────────────────

/** JSON Schema subset for block configuration */
export interface BlockSchema {
  type: 'object';
  properties?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description?: string;
      default?: Exclude<Json, undefined>;
      enum?: Json[];
      items?: {
        type: string;
      };
      /** UI widget hint from `.meta({ format })`, e.g. 'dynamic-dropdown'. */
      format?: string;
      /** UI label from `.meta({ label })`. */
      label?: string;
      /** Show this field only when a sibling field equals a value (or one of several). */
      showWhen?: {
        field: string;
        equals: string | number | boolean | ReadonlyArray<string | number | boolean>;
      };
    }
  >;
  required?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Definition - Metadata for registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block definition - runtime metadata for a block type.
 *
 * Visual metadata (name, description, icon, color, category) comes from package.json.
 * i18n keys: `blocks.{id}.*`
 */
/**
 * Declares a block as a HOST-scheduled trigger: the hub owns the schedule and
 * fires the block's output, so a trigger-only plugin needs no resident process
 * and scale-to-zero can reap it between fires.
 *
 * The union is the extension point. New schedule kinds (cron, webhook, ...) are
 * added as additional members keyed by `kind`; consumers switch on `kind`, so
 * adding one is purely additive and an older hub simply ignores a `kind` it does
 * not recognise. Keep members flat and self-describing for that reason.
 */
export type BlockTrigger = {
  /** Fixed interval. `cron`/`webhook`/... are future members of this union. */
  kind: 'interval';
  /**
   * Name of the block's config field (a number of milliseconds) that sets the
   * interval. Read per workflow instance so the operator controls the period;
   * a missing or invalid value disables that instance's trigger (fails closed).
   */
  intervalField: string;
  /** Output port id the hub emits on each time the trigger fires. */
  output: string;
};

export interface BlockDefinition {
  /** Local block ID */
  id: string;
  /** Full qualified type: pluginId:blockId (set on registration) */
  type?: string;
  /** Input ports */
  inputs: BlockPort[];
  /** Output ports */
  outputs: BlockPort[];
  /** JSON Schema for configuration */
  schema: BlockSchema;
  /** Plugin that provides this block */
  pluginId?: string;
  /**
   * Present when the block is a host-scheduled trigger (see {@link BlockTrigger}).
   * Optional, so non-trigger blocks and older plugins are unaffected.
   */
  trigger?: BlockTrigger;
}
