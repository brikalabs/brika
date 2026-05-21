/**
 * Workspace Validation
 *
 * Validate entire workflow workspace including all connections. Diagnostics
 * are accumulated in a single list and split at the end into `errors` /
 * `warnings` by looking up each code's severity in the BrikaError catalog —
 * the catalog is the single source of truth for "is this fatal".
 */

import { severityForCode } from '@brika/ipc';
import type { BlockTypeDefinition, Workflow } from '../types';
import { parsePortRef } from '../types/ports';
import { isValidConnection } from './connections';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single validation diagnostic.
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
 * Result of workspace validation. `errors` and `warnings` are derived from
 * the single `diagnostics` list using the catalog's severity for each code.
 */
export interface ValidationResult {
  /** Whether the workspace is valid (no error-severity diagnostics) */
  valid: boolean;
  /** Diagnostics whose catalog severity is `error` or `fatal` */
  errors: ValidationError[];
  /** Diagnostics whose catalog severity is `warning` or `info` */
  warnings: ValidationError[];
}

/**
 * Block type registry for looking up block definitions.
 */
export interface BlockTypeRegistry {
  get(type: string): BlockTypeDefinition | undefined;
}

interface ValidationContext {
  blockMap: Map<string, Workflow['blocks'][0]>;
  registry: BlockTypeRegistry;
  diagnostics: ValidationError[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateBlockTypeExists(
  block: Workflow['blocks'][0],
  blockPath: string,
  ctx: ValidationContext
): BlockTypeDefinition | null {
  const blockType = ctx.registry.get(block.type);
  if (!blockType) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_UNKNOWN_BLOCK_TYPE',
      message: `Unknown block type: "${block.type}"`,
      path: `${blockPath}.type`,
    });
    return null;
  }
  return blockType;
}

function validateOutputConnection(
  ref: string,
  refPath: string,
  block: Workflow['blocks'][0],
  outputPortId: string,
  outputPort: BlockTypeDefinition['outputs'][0],
  ctx: ValidationContext
): void {
  let targetBlockId: string;
  let targetPortId: string;
  try {
    const parsed = parsePortRef(ref as `${string}:${string}`);
    targetBlockId = parsed.blockId;
    targetPortId = parsed.portId;
  } catch {
    ctx.diagnostics.push({
      code: 'WORKFLOW_INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  const targetBlock = ctx.blockMap.get(targetBlockId);
  if (!targetBlock) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_TARGET_BLOCK_NOT_FOUND',
      message: `Target block "${targetBlockId}" not found`,
      path: refPath,
    });
    return;
  }

  const targetBlockType = ctx.registry.get(targetBlock.type);
  if (!targetBlockType) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_UNKNOWN_TARGET_BLOCK_TYPE',
      message: `Target block "${targetBlockId}" has unknown type "${targetBlock.type}"`,
      path: refPath,
    });
    return;
  }

  const targetPort = targetBlockType.inputs.find((p) => p.id === targetPortId);
  if (!targetPort) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_TARGET_PORT_NOT_FOUND',
      message: `Target port "${targetPortId}" not found on block "${targetBlockId}"`,
      path: refPath,
    });
    return;
  }

  const connectionResult = isValidConnection({
    sourcePort: outputPort,
    targetPort,
  });

  if (!connectionResult.valid) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_INVALID_CONNECTION',
      message: connectionResult.reason,
      path: refPath,
    });
  }

  checkBidirectionalRef(
    block,
    outputPortId,
    targetBlock,
    targetPortId,
    targetBlockId,
    refPath,
    ctx
  );
}

function checkBidirectionalRef(
  block: Workflow['blocks'][0],
  outputPortId: string,
  targetBlock: Workflow['blocks'][0],
  targetPortId: string,
  targetBlockId: string,
  refPath: string,
  ctx: ValidationContext
): void {
  const targetInputRef = targetBlock.inputs[targetPortId];
  const expectedRef = `${block.id}:${outputPortId}`;
  if (targetInputRef !== expectedRef) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_MISSING_BIDIRECTIONAL_REF',
      message: `Target block "${targetBlockId}" input "${targetPortId}" does not reference back to "${expectedRef}"`,
      path: refPath,
    });
  }
}

function validateAllOutputsForBlock(
  block: Workflow['blocks'][0],
  blockPath: string,
  blockType: BlockTypeDefinition,
  ctx: ValidationContext
): void {
  for (const [outputPortId, ref] of Object.entries(block.outputs)) {
    const outputPort = blockType.outputs.find((p) => p.id === outputPortId);
    if (!outputPort) {
      ctx.diagnostics.push({
        code: 'WORKFLOW_UNKNOWN_OUTPUT_PORT',
        message: `Unknown output port "${outputPortId}" on block type "${block.type}"`,
        path: `${blockPath}.outputs.${outputPortId}`,
      });
      continue;
    }

    if (ref) {
      const refPath = `${blockPath}.outputs.${outputPortId}`;
      validateOutputConnection(ref, refPath, block, outputPortId, outputPort, ctx);
    }
  }
}

function validateInputConnection(ref: string, refPath: string, ctx: ValidationContext): void {
  let sourceBlockId: string;
  try {
    const parsed = parsePortRef(ref as `${string}:${string}`);
    sourceBlockId = parsed.blockId;
  } catch {
    ctx.diagnostics.push({
      code: 'WORKFLOW_INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  const sourceBlock = ctx.blockMap.get(sourceBlockId);
  if (!sourceBlock) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_SOURCE_BLOCK_NOT_FOUND',
      message: `Source block "${sourceBlockId}" not found`,
      path: refPath,
    });
  }
}

function validateAllInputsForBlock(
  block: Workflow['blocks'][0],
  blockPath: string,
  blockType: BlockTypeDefinition,
  ctx: ValidationContext
): void {
  for (const [inputPortId, ref] of Object.entries(block.inputs)) {
    const inputPort = blockType.inputs.find((p) => p.id === inputPortId);
    if (!inputPort) {
      ctx.diagnostics.push({
        code: 'WORKFLOW_UNKNOWN_INPUT_PORT',
        message: `Unknown input port "${inputPortId}" on block type "${block.type}"`,
        path: `${blockPath}.inputs.${inputPortId}`,
      });
      continue;
    }

    if (ref) {
      const refPath = `${blockPath}.inputs.${inputPortId}`;
      validateInputConnection(ref, refPath, ctx);
    }
  }
}

function checkOrphanBlocks(workflow: Workflow, ctx: ValidationContext): void {
  for (const block of workflow.blocks) {
    const blockType = ctx.registry.get(block.type);
    if (!blockType) {
      continue;
    }

    const hasInputPorts = blockType.inputs.length > 0;
    const hasInputConnections = Object.values(block.inputs).some((ref) => ref !== undefined);

    if (hasInputPorts && !hasInputConnections) {
      ctx.diagnostics.push({
        code: 'WORKFLOW_ORPHAN_BLOCK',
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
 * Diagnostics are split into `errors` / `warnings` using each code's catalog
 * severity. Unknown codes default to `error` to surface typos loudly.
 */
export function validateWorkspace(
  workflow: Workflow,
  registry: BlockTypeRegistry
): ValidationResult {
  const ctx: ValidationContext = {
    blockMap: new Map(workflow.blocks.map((b) => [b.id, b])),
    registry,
    diagnostics: [],
  };

  for (let i = 0; i < workflow.blocks.length; i++) {
    const block = workflow.blocks[i];
    if (!block) {
      continue;
    }

    const blockPath = `blocks[${i}]`;

    const blockType = validateBlockTypeExists(block, blockPath, ctx);
    if (!blockType) {
      continue;
    }

    validateAllOutputsForBlock(block, blockPath, blockType, ctx);
    validateAllInputsForBlock(block, blockPath, blockType, ctx);
  }

  checkOrphanBlocks(workflow, ctx);

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  for (const d of ctx.diagnostics) {
    const sev = severityForCode(d.code);
    if (sev === 'warning' || sev === 'info') {
      warnings.push(d);
    } else {
      errors.push(d);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
