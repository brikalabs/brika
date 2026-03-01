/**
 * Workspace Validation
 *
 * Validate entire workflow workspace including all connections.
 */

import type { BlockTypeDefinition, Workflow } from '../types';
import { parsePortRef } from '../types/ports';
import { isValidConnection } from './connections';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single validation error.
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Path to the error (e.g., "blocks[0].outputs.then") */
  path?: string;
}

/**
 * Result of workspace validation.
 */
export interface ValidationResult {
  /** Whether the workspace is valid */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
  /** List of warnings (non-fatal issues) */
  warnings: ValidationError[];
}

/**
 * Block type registry for looking up block definitions.
 */
export interface BlockTypeRegistry {
  get(type: string): BlockTypeDefinition | undefined;
}

/**
 * Validation context passed through validation functions.
 * Consolidates commonly-used parameters to simplify function signatures.
 */
interface ValidationContext {
  blockMap: Map<string, Workflow['blocks'][0]>;
  registry: BlockTypeRegistry;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a block type exists in the registry.
 */
function validateBlockTypeExists(
  block: Workflow['blocks'][0],
  blockPath: string,
  ctx: ValidationContext
): BlockTypeDefinition | null {
  const blockType = ctx.registry.get(block.type);
  if (!blockType) {
    ctx.errors.push({
      code: 'UNKNOWN_BLOCK_TYPE',
      message: `Unknown block type: "${block.type}"`,
      path: `${blockPath}.type`,
    });
    return null;
  }
  return blockType;
}

/**
 * Validate a single output connection.
 */
function validateOutputConnection(
  ref: string,
  refPath: string,
  block: Workflow['blocks'][0],
  outputPortId: string,
  outputPort: BlockTypeDefinition['outputs'][0],
  ctx: ValidationContext
): void {
  // Parse port reference
  let targetBlockId: string;
  let targetPortId: string;
  try {
    const parsed = parsePortRef(ref as `${string}:${string}`);
    targetBlockId = parsed.blockId;
    targetPortId = parsed.portId;
  } catch {
    ctx.errors.push({
      code: 'INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  // Check target block exists
  const targetBlock = ctx.blockMap.get(targetBlockId);
  if (!targetBlock) {
    ctx.errors.push({
      code: 'TARGET_BLOCK_NOT_FOUND',
      message: `Target block "${targetBlockId}" not found`,
      path: refPath,
    });
    return;
  }

  // Check target block type exists
  const targetBlockType = ctx.registry.get(targetBlock.type);
  if (!targetBlockType) {
    ctx.errors.push({
      code: 'UNKNOWN_TARGET_BLOCK_TYPE',
      message: `Target block "${targetBlockId}" has unknown type "${targetBlock.type}"`,
      path: refPath,
    });
    return;
  }

  // Check target port exists
  const targetPort = targetBlockType.inputs.find((p) => p.id === targetPortId);
  if (!targetPort) {
    ctx.errors.push({
      code: 'TARGET_PORT_NOT_FOUND',
      message: `Target port "${targetPortId}" not found on block "${targetBlockId}"`,
      path: refPath,
    });
    return;
  }

  // Validate connection
  const connectionResult = isValidConnection({
    sourcePort: outputPort,
    targetPort,
  });

  if (!connectionResult.valid) {
    ctx.errors.push({
      code: 'INVALID_CONNECTION',
      message: connectionResult.reason,
      path: refPath,
    });
  }

  // Check bidirectional consistency
  checkBidirectionalRef(
    block,
    outputPortId,
    targetBlock,
    targetPortId,
    targetBlockId,
    refPath,
    ctx.warnings
  );
}

/**
 * Check bidirectional consistency for a connection.
 */
function checkBidirectionalRef(
  block: Workflow['blocks'][0],
  outputPortId: string,
  targetBlock: Workflow['blocks'][0],
  targetPortId: string,
  targetBlockId: string,
  refPath: string,
  warnings: ValidationError[]
): void {
  const targetInputRef = targetBlock.inputs[targetPortId];
  const expectedRef = `${block.id}:${outputPortId}`;
  if (targetInputRef !== expectedRef) {
    warnings.push({
      code: 'MISSING_BIDIRECTIONAL_REF',
      message: `Target block "${targetBlockId}" input "${targetPortId}" does not reference back to "${expectedRef}"`,
      path: refPath,
    });
  }
}

/**
 * Validate all outputs for a block.
 */
function validateAllOutputsForBlock(
  block: Workflow['blocks'][0],
  blockPath: string,
  blockType: BlockTypeDefinition,
  ctx: ValidationContext
): void {
  for (const [outputPortId, ref] of Object.entries(block.outputs)) {
    const outputPort = blockType.outputs.find((p) => p.id === outputPortId);
    if (!outputPort) {
      ctx.errors.push({
        code: 'UNKNOWN_OUTPUT_PORT',
        message: `Unknown output port "${outputPortId}" on block type "${block.type}"`,
        path: `${blockPath}.outputs.${outputPortId}`,
      });
      continue;
    }

    // Validate connection if it exists
    if (ref) {
      const refPath = `${blockPath}.outputs.${outputPortId}`;
      validateOutputConnection(ref, refPath, block, outputPortId, outputPort, ctx);
    }
  }
}

/**
 * Validate a single input connection.
 */
function validateInputConnection(ref: string, refPath: string, ctx: ValidationContext): void {
  // Parse and validate reference
  let sourceBlockId: string;
  try {
    const parsed = parsePortRef(ref as `${string}:${string}`);
    sourceBlockId = parsed.blockId;
  } catch {
    ctx.errors.push({
      code: 'INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  // Check source block exists
  const sourceBlock = ctx.blockMap.get(sourceBlockId);
  if (!sourceBlock) {
    ctx.errors.push({
      code: 'SOURCE_BLOCK_NOT_FOUND',
      message: `Source block "${sourceBlockId}" not found`,
      path: refPath,
    });
  }
}

/**
 * Validate all inputs for a block.
 */
function validateAllInputsForBlock(
  block: Workflow['blocks'][0],
  blockPath: string,
  blockType: BlockTypeDefinition,
  ctx: ValidationContext
): void {
  for (const [inputPortId, ref] of Object.entries(block.inputs)) {
    const inputPort = blockType.inputs.find((p) => p.id === inputPortId);
    if (!inputPort) {
      ctx.errors.push({
        code: 'UNKNOWN_INPUT_PORT',
        message: `Unknown input port "${inputPortId}" on block type "${block.type}"`,
        path: `${blockPath}.inputs.${inputPortId}`,
      });
      continue;
    }

    // Validate connection if it exists
    if (ref) {
      const refPath = `${blockPath}.inputs.${inputPortId}`;
      validateInputConnection(ref, refPath, ctx);
    }
  }
}

/**
 * Check for orphan blocks (blocks with input ports but no incoming connections).
 */
function checkOrphanBlocks(
  workflow: Workflow,
  registry: BlockTypeRegistry,
  warnings: ValidationError[]
): void {
  for (const block of workflow.blocks) {
    const blockType = registry.get(block.type);
    if (!blockType) {
      continue;
    }

    const hasInputPorts = blockType.inputs.length > 0;
    const hasInputConnections = Object.values(block.inputs).some((ref) => ref !== undefined);

    if (hasInputPorts && !hasInputConnections) {
      // Block has input ports but no connections - might be orphaned
      warnings.push({
        code: 'ORPHAN_BLOCK',
        message: `Block "${block.id}" has input ports but no incoming connections`,
        path: `blocks.${block.id}`,
      });
    }
  }
}

/**
 * Validate an entire workflow workspace.
 *
 * Checks:
 * - All block types exist in registry
 * - All port references are valid
 * - All connections are valid (output → input, type compatible)
 * - Bidirectional refs are consistent
 *
 * @param workflow - Workflow to validate
 * @param registry - Block type registry for lookups
 * @returns Validation result
 */
export function validateWorkspace(
  workflow: Workflow,
  registry: BlockTypeRegistry
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Build validation context
  const ctx: ValidationContext = {
    blockMap: new Map(workflow.blocks.map((b) => [b.id, b])),
    registry,
    errors,
    warnings,
  };

  // Validate each block
  for (let i = 0; i < workflow.blocks.length; i++) {
    const block = workflow.blocks[i];
    if (!block) {
      continue;
    }

    const blockPath = `blocks[${i}]`;

    // Check block type exists
    const blockType = validateBlockTypeExists(block, blockPath, ctx);
    if (!blockType) {
      continue; // Can't validate ports without block type
    }

    // Validate output connections
    validateAllOutputsForBlock(block, blockPath, blockType, ctx);

    // Validate input connections
    validateAllInputsForBlock(block, blockPath, blockType, ctx);
  }

  // Check for orphan blocks
  checkOrphanBlocks(workflow, registry, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
