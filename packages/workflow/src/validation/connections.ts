/**
 * Connection Validation
 *
 * Validates that connections between ports are valid.
 */

import type { PortDefinition } from '../types';
import { getSchemaTypeName, isSchemaCompatible } from './compatibility';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for connection validation.
 */
export interface ConnectionCheck {
  /** Source port (should be output) */
  sourcePort: PortDefinition;
  /** Target port (should be input) */
  targetPort: PortDefinition;
}

/**
 * Result of connection validation.
 */
export type ConnectionResult =
  | {
      valid: true;
    }
  | {
      valid: false;
      reason: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that a connection between two ports is valid.
 *
 * Rules:
 * 1. Source must be an output port
 * 2. Target must be an input port
 * 3. Output schema must be compatible with input schema
 *
 * @param check - The ports to check
 * @returns Validation result with reason if invalid
 */
export function isValidConnection(check: ConnectionCheck): ConnectionResult {
  const { sourcePort, targetPort } = check;

  // Rule 1: Source must be an output port
  if (sourcePort.direction !== 'output') {
    return {
      valid: false,
      reason: `Source port "${sourcePort.id}" is not an output port (direction: ${sourcePort.direction})`,
    };
  }

  // Rule 2: Target must be an input port
  if (targetPort.direction !== 'input') {
    return {
      valid: false,
      reason: `Target port "${targetPort.id}" is not an input port (direction: ${targetPort.direction})`,
    };
  }

  // Rule 3: Schema compatibility
  if (!isSchemaCompatible(sourcePort.schema, targetPort.schema)) {
    const sourceType = getSchemaTypeName(sourcePort.schema);
    const targetType = getSchemaTypeName(targetPort.schema);
    return {
      valid: false,
      reason: `Type mismatch: output produces "${sourceType}" but input expects "${targetType}"`,
    };
  }

  return {
    valid: true,
  };
}
