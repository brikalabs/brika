/**
 * Block System Types
 *
 * Core types for block metadata and registration.
 */

import type { z } from 'zod';
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
  /** Unique port ID */
  id: string;
  /** Port direction */
  direction: PortDirection;
  /** Display name (or i18n key) */
  nameKey: string;
  /** Description tooltip (or i18n key) */
  descriptionKey?: string;
  /** Zod schema for validation */
  schema?: z.ZodType;
  /** JSON Schema for API/UI */
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
      items?: { type: string };
    }
  >;
  required?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Definition - Metadata for registration
// ─────────────────────────────────────────────────────────────────────────────

/** Block definition - metadata describing a block type */
export interface BlockDefinition {
  /** Local block ID */
  id: string;
  /** Full qualified type (set on registration) */
  type?: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category for grouping */
  category: string;
  /** Lucide icon name */
  icon: string;
  /** Hex color */
  color: string;
  /** Input ports */
  inputs: BlockPort[];
  /** Output ports */
  outputs: BlockPort[];
  /** JSON Schema for configuration */
  schema: BlockSchema;
  /** Plugin that provides this block */
  pluginId?: string;
}
