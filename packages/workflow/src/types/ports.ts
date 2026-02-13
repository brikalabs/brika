/**
 * Port Types
 *
 * Typed directional ports for block I/O.
 */

import type { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Port Direction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port direction - determines valid connection endpoints.
 * Connections are ONLY valid from "output" to "input".
 */
export type PortDirection = 'input' | 'output';

// ─────────────────────────────────────────────────────────────────────────────
// Port Reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reference to a port on a block instance.
 * Format: "blockId:portId" (e.g., "check-time:then")
 */
export type PortRef = `${string}:${string}`;

/**
 * Parse a port reference into its components.
 */
export function parsePortRef(ref: PortRef): { blockId: string; portId: string } {
  const colonIndex = ref.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid port reference: "${ref}" - must be "blockId:portId"`);
  }
  return {
    blockId: ref.slice(0, colonIndex),
    portId: ref.slice(colonIndex + 1),
  };
}

/**
 * Create a port reference from components.
 */
export function createPortRef(blockId: string, portId: string): PortRef {
  if (blockId.includes(':') || portId.includes(':')) {
    throw new Error('Block ID and port ID cannot contain ":"');
  }
  return `${blockId}:${portId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Port Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Definition of a port on a block type.
 * Used by plugins to define block I/O.
 */
export interface PortDefinition {
  /** Unique port ID within the block (e.g., "in", "then", "else") */
  id: string;

  /** Port direction - determines valid connection endpoints */
  direction: PortDirection;

  /** i18n key for display name (e.g., "blocks.condition.ports.then") */
  nameKey: string;

  /** i18n key for description tooltip */
  descriptionKey?: string;

  /**
   * Zod schema for port data validation.
   * - Output schemas define what data the port produces
   * - Input schemas define what data the port accepts
   * - Connection is valid if output schema is assignable to input schema
   */
  schema: z.ZodType;
}
