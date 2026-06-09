/**
 * Live input values per node, derived from the debug stream: for each edge,
 * the value last emitted on its source port is what the target's input port
 * currently "sees". Node-body views use this to resolve `{{ }}` config
 * client-side, so an Image block bound to `{{ inputs.in.albumArt }}` renders
 * the actual artwork instead of the raw expression.
 */

import { hasTemplate, resolveTemplate, type TemplateScope } from '@brika/sdk/expressions';
import type { Edge } from '@xyflow/react';
import { createContext, useContext } from 'react';

export type BlockInputValues = ReadonlyMap<string, Record<string, unknown>>;

export const BlockInputValuesContext = createContext<BlockInputValues>(new Map());

const EMPTY: Record<string, unknown> = {};

export function useBlockInputValues(nodeId: string): Record<string, unknown> {
  return useContext(BlockInputValuesContext).get(nodeId) ?? EMPTY;
}

/** Map each node to { inputPortId: lastValue } from the wires feeding it. */
export function collectInputValues(
  edges: ReadonlyArray<Edge>,
  portValues: Record<string, unknown>,
  blockOutputs: Record<string, unknown>
): Map<string, Record<string, unknown>> {
  const byNode = new Map<string, Record<string, unknown>>();
  for (const edge of edges) {
    const sourceKey = `${edge.source}:${edge.sourceHandle || 'out'}`;
    const value = sourceKey in portValues ? portValues[sourceKey] : blockOutputs[edge.source];
    if (value === undefined) {
      continue;
    }
    const inputs = byNode.get(edge.target) ?? {};
    inputs[edge.targetHandle || 'in'] = value;
    byNode.set(edge.target, inputs);
  }
  return byNode;
}

/**
 * Resolve `{{ }}` in string config fields against the node's live inputs, for
 * DISPLAY in node-body views. Returns the same object when nothing is
 * templated, so non-templating blocks re-render nothing.
 */
export function resolveConfigForView(
  config: Record<string, unknown>,
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const scope: TemplateScope = { inputs, config };
  let resolved: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && hasTemplate(value)) {
      resolved = resolved ?? { ...config };
      resolved[key] = resolveTemplate(value, scope);
    }
  }
  return resolved ?? config;
}
