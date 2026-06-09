/**
 * Static analysis of the workflow graph: every problem the engine would hit
 * at runtime that the editor can already see at build time.
 *
 * - type-mismatch: an EXISTING edge whose resolved source type no longer fits
 *   the target port (connections are checked at drag time, but upstream type
 *   changes, e.g. a reconfigured spark, can invalidate them later)
 * - missing-config: a required config field with no value
 * - unknown-block: the block type has no installed definition (plugin removed)
 * - cycle: the wiring loops back on itself (a reactive feedback loop runs
 *   forever unless a block breaks it; flagged as a warning)
 *
 * Pure functions over the editor graph. No React.
 */

import {
  displayType,
  isCompatible,
  isConcrete,
  type PortTypeMap,
  parsePortType,
  portKey,
} from '@brika/type-system';
import type { Edge, Node } from '@xyflow/react';
import type { BlockNodeData, BlockPort } from './BlockNode';
import type { BlockDefinition } from './BlockToolbar';

export type DiagnosticKind = 'type-mismatch' | 'missing-config' | 'unknown-block' | 'cycle';

export interface GraphDiagnostic {
  kind: DiagnosticKind;
  severity: 'error' | 'warning';
  /** Node to focus when the user clicks the diagnostic. */
  nodeId: string;
  /** Offending edge, for edge-level highlighting. */
  edgeId?: string;
  message: string;
}

interface DiagnosticsInput {
  nodes: ReadonlyArray<Node>;
  edges: ReadonlyArray<Edge>;
  portTypeMap: PortTypeMap;
  blockSchemaMap: Record<string, BlockDefinition>;
}

export function collectDiagnostics(input: DiagnosticsInput): GraphDiagnostic[] {
  const blockNodes = input.nodes.filter((n) => n.type === 'block');
  return [
    ...edgeTypeDiagnostics(blockNodes, input.edges, input.portTypeMap),
    ...configDiagnostics(blockNodes, input.blockSchemaMap),
    ...cycleDiagnostics(blockNodes, input.edges),
  ];
}

/** The ids of edges with a type mismatch, for stroke highlighting. */
export function invalidEdgeIds(diagnostics: ReadonlyArray<GraphDiagnostic>): Set<string> {
  const ids = new Set<string>();
  for (const d of diagnostics) {
    if (d.edgeId) {
      ids.add(d.edgeId);
    }
  }
  return ids;
}

function nodeData(node: Node): BlockNodeData | null {
  const data: Record<string, unknown> = node.data;
  return typeof data.type === 'string' ? (node.data as BlockNodeData) : null;
}

function findPort(
  ports: ReadonlyArray<BlockPort> | undefined,
  portId: string
): BlockPort | undefined {
  return ports?.find((p) => p.id === portId);
}

function edgeTypeDiagnostics(
  nodes: ReadonlyArray<Node>,
  edges: ReadonlyArray<Edge>,
  portTypeMap: PortTypeMap
): GraphDiagnostic[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: GraphDiagnostic[] = [];
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const sourceData = nodeData(source);
    const targetData = nodeData(target);
    const sourcePortId = edge.sourceHandle || 'out';
    const targetPortId = edge.targetHandle || 'in';
    const sourcePort = findPort(sourceData?.outputs, sourcePortId);
    const targetPort = findPort(targetData?.inputs, targetPortId);
    if (!sourcePort || !targetPort) {
      continue; // dangling handles are dropped by the editor effect
    }
    const outType =
      portTypeMap.get(portKey(edge.source, sourcePortId)) ?? parsePortType(sourcePort);
    // Compare against the DECLARED input type: inference propagates the
    // incoming type onto the input port, which would mask the mismatch.
    const declaredIn = parsePortType(targetPort);
    const inType = isConcrete(declaredIn)
      ? declaredIn
      : (portTypeMap.get(portKey(edge.target, targetPortId)) ?? declaredIn);
    if (!isCompatible(outType, inType)) {
      out.push({
        kind: 'type-mismatch',
        severity: 'error',
        nodeId: edge.target,
        edgeId: edge.id,
        message: `${sourceData?.label ?? edge.source}.${sourcePortId} (${displayType(outType)}) does not fit ${targetData?.label ?? edge.target}.${targetPortId} (${displayType(inType)})`,
      });
    }
  }
  return out;
}

/** Empty when undefined, null, or a blank string; 0/false are real values. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

function configDiagnostics(
  nodes: ReadonlyArray<Node>,
  blockSchemaMap: Record<string, BlockDefinition>
): GraphDiagnostic[] {
  const out: GraphDiagnostic[] = [];
  for (const node of nodes) {
    const data = nodeData(node);
    if (!data) {
      continue;
    }
    const def = blockSchemaMap[data.type];
    if (!def) {
      out.push({
        kind: 'unknown-block',
        severity: 'error',
        nodeId: node.id,
        message: `${data.label || node.id}: block type "${data.type}" is not installed`,
      });
      continue;
    }
    for (const field of def.schema?.required ?? []) {
      if (isBlank(data.config?.[field])) {
        out.push({
          kind: 'missing-config',
          severity: 'warning',
          nodeId: node.id,
          message: `${data.label || node.id}: required field "${field}" is empty`,
        });
      }
    }
  }
  return out;
}

function cycleDiagnostics(
  nodes: ReadonlyArray<Node>,
  edges: ReadonlyArray<Edge>
): GraphDiagnostic[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge.target);
    adjacency.set(edge.source, list);
  }

  const labels = new Map<string, string>();
  for (const node of nodes) {
    labels.set(node.id, nodeData(node)?.label || node.id);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        return [...stack.slice(stack.indexOf(next)), next];
      }
      if (c === WHITE) {
        const nested = visit(next);
        if (nested) {
          return nested;
        }
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };

  let found: string[] | null = null;
  for (const node of nodes) {
    if ((color.get(node.id) ?? WHITE) === WHITE) {
      found = visit(node.id);
      if (found) {
        break;
      }
    }
  }

  if (!found) {
    return [];
  }
  const path = found.map((id) => labels.get(id) ?? id).join(' -> ');
  return [
    {
      kind: 'cycle',
      severity: 'warning',
      nodeId: found[0],
      message: `Feedback loop: ${path}. It will run forever unless a block breaks it.`,
    },
  ];
}
