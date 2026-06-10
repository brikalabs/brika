/**
 * Pure helpers for wire-drop block suggestions and connection feedback.
 *
 * Given the type flowing out of (or expected into) the dragged handle,
 * filter the block catalog down to blocks with at least one compatible
 * port and remember which port to wire to.
 *
 * No React. Tested in isolation.
 */

import { displayType, isCompatible, parsePortType, type TypeDescriptor } from '@brika/type-system';
import type { FinalConnectionState } from '@xyflow/react';
import type { BlockDefinition } from './BlockToolbar';
import type { ConnectionOrigin } from './useWorkflowEditor';

export interface CompatibleBlock {
  block: BlockDefinition;
  /** The port on the candidate block the wire should attach to. */
  portId: string;
  portName: string;
}

/**
 * Blocks that can RECEIVE the dragged output: at least one input port is
 * compatible with the source type. An unknown source type (unresolved
 * generic) matches every block with inputs.
 */
export function compatibleBlocksForSource(
  blocks: BlockDefinition[],
  sourceType: TypeDescriptor | undefined
): CompatibleBlock[] {
  const result: CompatibleBlock[] = [];
  for (const block of blocks) {
    const port = (block.inputs ?? []).find(
      (p) => !sourceType || isCompatible(sourceType, parsePortType(p))
    );
    if (port) {
      result.push({ block, portId: port.id, portName: port.name || port.id });
    }
  }
  return result;
}

/**
 * Blocks that can FEED the dragged input: at least one output port is
 * compatible with the target type. An unknown target type matches every
 * block with outputs.
 */
export function compatibleBlocksForTarget(
  blocks: BlockDefinition[],
  targetType: TypeDescriptor | undefined
): CompatibleBlock[] {
  const result: CompatibleBlock[] = [];
  for (const block of blocks) {
    const port = (block.outputs ?? []).find(
      (p) => !targetType || isCompatible(parsePortType(p), targetType)
    );
    if (port) {
      result.push({ block, portId: port.id, portName: port.name || port.id });
    }
  }
  return result;
}

/** Human-readable label for a type descriptor, or a fallback when unknown. */
export function typeLabel(type: TypeDescriptor | undefined, fallback: string): string {
  return type ? displayType(type) : fallback;
}

/** Client coordinates of a mouse or touch connect-end event. */
export function eventClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
  }
  return { x: event.clientX, y: event.clientY };
}

/** Resolve the dragged handle into a ConnectionOrigin, defaulting handle ids. */
export function connectionOriginOf(connectionState: FinalConnectionState): ConnectionOrigin | null {
  const { fromNode, fromHandle } = connectionState;
  if (!fromNode || !fromHandle) {
    return null;
  }
  const handleType = fromHandle.type;
  return {
    nodeId: fromNode.id,
    handleId: fromHandle.id ?? (handleType === 'source' ? 'out' : 'in'),
    handleType,
  };
}
