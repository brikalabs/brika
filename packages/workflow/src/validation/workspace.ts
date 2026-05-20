/**
 * Workspace Validation
 *
 * Validate entire workflow workspace including all connections.
 */

import type { CatalogedErrorCode } from '@brika/ipc';
import { lookupCatalogEntry } from '@brika/ipc';
import type { BlockTypeDefinition, Workflow } from '../types';
import { parsePortRef } from '../types/ports';
import { isValidConnection } from './connections';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation codes are the `WORKFLOW_*` slice of the platform error catalog.
 * Defining the union as `Extract<CatalogedErrorCode, 'WORKFLOW_…'>` means a
 * typo or an uncatalogued code is a compile error — the catalog stays the
 * single source of truth for documentation, severity, and i18n keys.
 */
export type WorkflowValidationCode = Extract<CatalogedErrorCode, `WORKFLOW_${string}`>;

/**
 * A single validation diagnostic. `errors` vs `warnings` is derived from
 * the code's catalog severity — call sites push a single shape and the
 * report classifier figures out where it belongs.
 */
export interface ValidationError {
  /** Error code for programmatic handling — must be a catalogued WORKFLOW_* code. */
  code: WorkflowValidationCode;
  /** Human-readable error message */
  message: string;
  /** Path to the error (e.g., "blocks[0].outputs.then") */
  path?: string;
}

/**
 * Result of workspace validation.
 *
 * `errors` and `warnings` are derived from the catalog's severity field
 * for each diagnostic's code — adding a new validation code only requires
 * setting `severity` on its catalog entry; this report classifier picks
 * it up automatically.
 */
export interface ValidationResult {
  /** Whether the workspace is valid (no error-severity diagnostics). */
  valid: boolean;
  /** Diagnostics with catalog severity `error` or `fatal`. */
  errors: ValidationError[];
  /** Diagnostics with catalog severity `warning` or `info`. */
  warnings: ValidationError[];
  /** All diagnostics in insertion order; preferred shape for consumers that don't care about the error/warning split. */
  diagnostics: ValidationError[];
}

/**
 * Block type registry for looking up block definitions.
 */
export interface BlockTypeRegistry {
  get(type: string): BlockTypeDefinition | undefined;
}

/**
 * Validation context passed through validation functions.
 *
 * Call sites push to a single `diagnostics` list; the catalog's severity
 * field decides whether each entry counts as an error or a warning when
 * the final report is assembled.
 */
interface ValidationContext {
  blockMap: Map<string, Workflow['blocks'][0]>;
  registry: BlockTypeRegistry;
  diagnostics: ValidationError[];
}

/**
 * Classify a diagnostic as an error or a warning via its catalog severity.
 * `error` and `fatal` count as errors (block validity); `warning` and
 * `info` are non-fatal. Uncatalogued codes default to error — a typo or
 * unmigrated code surfaces loudly instead of silently being downgraded.
 */
function isErrorSeverity(code: WorkflowValidationCode): boolean {
  const severity = lookupCatalogEntry(code)?.severity;
  return severity === undefined || severity === 'error' || severity === 'fatal';
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
    ctx.diagnostics.push({
      code: 'WORKFLOW_UNKNOWN_BLOCK_TYPE',
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
    ctx.diagnostics.push({
      code: 'WORKFLOW_INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  // Check target block exists
  const targetBlock = ctx.blockMap.get(targetBlockId);
  if (!targetBlock) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_TARGET_BLOCK_NOT_FOUND',
      message: `Target block "${targetBlockId}" not found`,
      path: refPath,
    });
    return;
  }

  // Check target block type exists
  const targetBlockType = ctx.registry.get(targetBlock.type);
  if (!targetBlockType) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_UNKNOWN_TARGET_BLOCK_TYPE',
      message: `Target block "${targetBlockId}" has unknown type "${targetBlock.type}"`,
      path: refPath,
    });
    return;
  }

  // Check target port exists
  const targetPort = targetBlockType.inputs.find((p) => p.id === targetPortId);
  if (!targetPort) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_TARGET_PORT_NOT_FOUND',
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
    ctx.diagnostics.push({
      code: 'WORKFLOW_INVALID_CONNECTION',
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
    ctx.diagnostics
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
  diagnostics: ValidationError[]
): void {
  const targetInputRef = targetBlock.inputs[targetPortId];
  const expectedRef = `${block.id}:${outputPortId}`;
  if (targetInputRef !== expectedRef) {
    diagnostics.push({
      code: 'WORKFLOW_MISSING_BIDIRECTIONAL_REF',
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
      ctx.diagnostics.push({
        code: 'WORKFLOW_UNKNOWN_OUTPUT_PORT',
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
    ctx.diagnostics.push({
      code: 'WORKFLOW_INVALID_PORT_REF',
      message: `Invalid port reference: "${ref}"`,
      path: refPath,
    });
    return;
  }

  // Check source block exists
  const sourceBlock = ctx.blockMap.get(sourceBlockId);
  if (!sourceBlock) {
    ctx.diagnostics.push({
      code: 'WORKFLOW_SOURCE_BLOCK_NOT_FOUND',
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
      ctx.diagnostics.push({
        code: 'WORKFLOW_UNKNOWN_INPUT_PORT',
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
  diagnostics: ValidationError[]
): void {
  for (const block of workflow.blocks) {
    const blockType = registry.get(block.type);
    if (!blockType) {
      continue;
    }

    const hasInputPorts = blockType.inputs.length > 0;
    const hasInputConnections = Object.values(block.inputs).some((ref) => ref !== undefined);

    if (hasInputPorts && !hasInputConnections) {
      // Block has input ports but no connections - might be orphaned.
      // The catalog declares this code as `warning` severity, so it
      // surfaces in the result's `warnings` list, not `errors`.
      diagnostics.push({
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
 * @param workflow - Workflow to validate
 * @param registry - Block type registry for lookups
 * @returns Validation result
 */
export function validateWorkspace(
  workflow: Workflow,
  registry: BlockTypeRegistry
): ValidationResult {
  const diagnostics: ValidationError[] = [];

  const ctx: ValidationContext = {
    blockMap: new Map(workflow.blocks.map((b) => [b.id, b])),
    registry,
    diagnostics,
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

  checkOrphanBlocks(workflow, registry, diagnostics);

  // Classify by catalog severity. `error` and `fatal` -> errors;
  // `warning` and `info` -> warnings. Uncatalogued codes default to error.
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  for (const d of diagnostics) {
    (isErrorSeverity(d.code) ? errors : warnings).push(d);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    diagnostics,
  };
}
