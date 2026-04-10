/**
 * WorkflowTypeContext
 *
 * Provides resolved port types to all workflow editor components via React context.
 * Eliminates the useEffect → setNodes → re-render cascade by keeping inferred
 * types as a pure derived value (useMemo) rather than mutating node state.
 */

import { displayType, type PortTypeMap, type TypeDescriptor } from '@brika/type-system';
import { createContext, useContext } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

export const WorkflowTypeContext = createContext<PortTypeMap>(new Map());

/**
 * Get the resolved type for a specific port.
 */
export function usePortType(nodeId: string, portId: string): TypeDescriptor | undefined {
  const map = useContext(WorkflowTypeContext);
  return map.get(`${nodeId}:${portId}`);
}

/**
 * Get the display name of a resolved port type.
 */
export function usePortTypeName(nodeId: string, portId: string): string | undefined {
  const desc = usePortType(nodeId, portId);
  return desc ? displayType(desc) : undefined;
}

/**
 * Get the full PortTypeMap.
 */
export function usePortTypeMap(): PortTypeMap {
  return useContext(WorkflowTypeContext);
}
