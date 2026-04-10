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
  /** @deprecated Use `type` (TypeDescriptor) instead */
  typeName: string;
  /** Structural type descriptor from @brika/type-system (JSON-serializable) */
  type?: Record<string, unknown>;
  /** JSON Schema for this port (undefined for generic/passthrough) */
  jsonSchema?: Record<string, unknown>;
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
      default?: Json;
      enum?: Json[];
      items?: {
        type: string;
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
}
