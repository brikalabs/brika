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

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a block type exists in the registry.
 */
function validateBlockTypeExists(
  block: Workflow['blocks'][0],
  blockPath: string,
  registry: BlockTypeRegistry,
  errors: ValidationError[]
): BlockTypeDefinition | null {
  const blockType = registry.get(block.type);
  if (!blockType) {
    errors.push({
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
  blockMap: Map<string, Workflow['blocks'][0]>,
  registry: BlockTypeRegistry,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  // Parse port reference
  let targetBlockId: string;
  let targetPortId: string;
  try {
    const parsed = parsePortRef(ref as `${string}:${string}`);
    targetBlockId = parsed.blockId;
    targetPortId = parsed.portId;
  } catch {
    errors.push({
      code: 'INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  // Check target block exists
  const targetBlock = blockMap.get(targetBlockId);
  if (!targetBlock) {
    errors.push({
      code: 'TARGET_BLOCK_NOT_FOUND',
      message: `Target block "${targetBlockId}" not found`,
      path: refPath,
    });
    return;
  }

  // Check target block type exists
  const targetBlockType = registry.get(targetBlock.type);
  if (!targetBlockType) {
    errors.push({
      code: 'UNKNOWN_TARGET_BLOCK_TYPE',
      message: `Target block "${targetBlockId}" has unknown type "${targetBlock.type}"`,
      path: refPath,
    });
    return;
  }

  // Check target port exists
  const targetPort = targetBlockType.inputs.find((p) => p.id === targetPortId);
  if (!targetPort) {
    errors.push({
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
    errors.push({
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
    warnings
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
  const targetInputRefs = targetBlock.inputs[targetPortId] || [];
  const expectedRef = `${block.id}:${outputPortId}`;
  if (!targetInputRefs.includes(expectedRef as (typeof targetInputRefs)[0])) {
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
  blockMap: Map<string, Workflow['blocks'][0]>,
  registry: BlockTypeRegistry,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  for (const [outputPortId, refs] of Object.entries(block.outputs)) {
    const outputPort = blockType.outputs.find((p) => p.id === outputPortId);
    if (!outputPort) {
      errors.push({
        code: 'UNKNOWN_OUTPUT_PORT',
        message: `Unknown output port "${outputPortId}" on block type "${block.type}"`,
        path: `${blockPath}.outputs.${outputPortId}`,
      });
      continue;
    }

    // Validate each connection
    for (let j = 0; j < refs.length; j++) {
      const ref = refs[j];
      if (!ref) continue;

      const refPath = `${blockPath}.outputs.${outputPortId}[${j}]`;
      validateOutputConnection(
        ref,
        refPath,
        block,
        outputPortId,
        outputPort,
        blockMap,
        registry,
        errors,
        warnings
      );
    }
  }
}

/**
 * Validate a single input connection.
 */
function validateInputConnection(
  ref: string,
  refPath: string,
  blockMap: Map<string, Workflow['blocks'][0]>,
  errors: ValidationError[]
): void {
  // Parse and validate reference
  let sourceBlockId: string;
  try {
    const parsed = parsePortRef(ref as `${string}:${string}`);
    sourceBlockId = parsed.blockId;
  } catch {
    errors.push({
      code: 'INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  // Check source block exists
  const sourceBlock = blockMap.get(sourceBlockId);
  if (!sourceBlock) {
    errors.push({
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
  blockMap: Map<string, Workflow['blocks'][0]>,
  errors: ValidationError[]
): void {
  for (const [inputPortId, refs] of Object.entries(block.inputs)) {
    const inputPort = blockType.inputs.find((p) => p.id === inputPortId);
    if (!inputPort) {
      errors.push({
        code: 'UNKNOWN_INPUT_PORT',
        message: `Unknown input port "${inputPortId}" on block type "${block.type}"`,
        path: `${blockPath}.inputs.${inputPortId}`,
      });
      continue;
    }

    for (let j = 0; j < refs.length; j++) {
      const ref = refs[j];
      if (!ref) continue;

      const refPath = `${blockPath}.inputs.${inputPortId}[${j}]`;
      validateInputConnection(ref, refPath, blockMap, errors);
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
    if (!blockType) continue;

    const hasInputPorts = blockType.inputs.length > 0;
    const hasInputConnections = Object.values(block.inputs).some((refs) => refs.length > 0);

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

  // Build block lookup map
  const blockMap = new Map(workflow.blocks.map((b) => [b.id, b]));

  // Validate each block
  for (let i = 0; i < workflow.blocks.length; i++) {
    const block = workflow.blocks[i];
    if (!block) continue;

    const blockPath = `blocks[${i}]`;

    // Check block type exists
    const blockType = validateBlockTypeExists(block, blockPath, registry, errors);
    if (!blockType) {
      continue; // Can't validate ports without block type
    }

    // Validate output connections
    validateAllOutputsForBlock(block, blockPath, blockType, blockMap, registry, errors, warnings);

    // Validate input connections
    validateAllInputsForBlock(block, blockPath, blockType, blockMap, errors);
  }

  // Check for orphan blocks
  checkOrphanBlocks(workflow, registry, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
