/**
 * Graph Type Inference Engine
 *
 * Resolves generic, passthrough, and resolved port types
 * based on the workflow graph structure and connections.
 *
 * Algorithm:
 * 1. Resolve external types ($resolve markers via TypeResolver)
 * 2. Forward propagation: concrete output → connected generic input
 * 3. Passthrough resolution: passthrough(inputId) → copy input's resolved type
 * 4. Backward propagation: concrete input → connected generic output
 * 5. Iterate until stable (max 10 passes)
 */

import { isConcrete, needsResolution, type TypeDescriptor } from './descriptor';

// ─────────────────────────────────────────────────────────────────────────────
// Graph Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  ports: Record<string, { direction: 'input' | 'output'; type: TypeDescriptor }>;
  config?: Record<string, unknown>;
}

export interface GraphEdge {
  sourceNode: string;
  sourcePort: string;
  targetNode: string;
  targetPort: string;
}

/**
 * External type resolver — looks up types from external sources.
 * e.g., spark registry for $resolve:spark:sparkType
 */
export interface TypeResolver {
  resolve(source: string, key: string): TypeDescriptor | null;
}

/** Map of "nodeId:portId" → resolved TypeDescriptor */
export type PortTypeMap = Map<string, TypeDescriptor>;

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 10;

/**
 * Infer types for all ports in a workflow graph.
 * Returns a map of resolved types for every port.
 */
export function inferTypes(
  nodes: GraphNode[],
  edges: GraphEdge[],
  resolver?: TypeResolver
): PortTypeMap {
  const result: PortTypeMap = new Map();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build edge lookup maps
  const incoming = buildIncomingMap(edges);
  const outgoing = buildOutgoingMap(edges);

  // Seed with declared types (concrete types go directly into result)
  for (const node of nodes) {
    for (const [portId, port] of Object.entries(node.ports)) {
      const key = portKey(node.id, portId);
      if (isConcrete(port.type)) {
        result.set(key, port.type);
      }
    }
  }

  // Phase 1: Resolve external types ($resolve markers)
  if (resolver) {
    resolveExternalTypes(nodes, resolver, result);
  }

  // Phase 2-4: Iterate until stable
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (!runInferencePass(nodes, incoming, outgoing, nodeMap, result)) {
      break;
    }
  }

  return result;
}

function runInferencePass(
  nodes: GraphNode[],
  incoming: IncomingMap,
  outgoing: OutgoingMap,
  nodeMap: Map<string, GraphNode>,
  result: PortTypeMap
): boolean {
  let changed = false;
  for (const node of nodes) {
    if (propagateForward(node, incoming, nodeMap, result)) {
      changed = true;
    }
    if (resolvePassthrough(node, result)) {
      changed = true;
    }
    if (propagateBackward(node, outgoing, nodeMap, result)) {
      changed = true;
    }
  }
  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge Lookup Maps
// ─────────────────────────────────────────────────────────────────────────────

interface EdgeTarget {
  node: string;
  port: string;
}

/** Map: targetNodeId → (targetPortId → source) */
type IncomingMap = Map<string, Map<string, EdgeTarget>>;

/** Map: sourceNodeId → (sourcePortId → targets[]) */
type OutgoingMap = Map<string, Map<string, EdgeTarget[]>>;

function buildIncomingMap(edges: GraphEdge[]): IncomingMap {
  const map: IncomingMap = new Map();
  for (const e of edges) {
    if (!map.has(e.targetNode)) {
      map.set(e.targetNode, new Map());
    }
    map.get(e.targetNode)?.set(e.targetPort, { node: e.sourceNode, port: e.sourcePort });
  }
  return map;
}

function buildOutgoingMap(edges: GraphEdge[]): OutgoingMap {
  const map: OutgoingMap = new Map();
  for (const e of edges) {
    if (!map.has(e.sourceNode)) {
      map.set(e.sourceNode, new Map());
    }
    const portMap = map.get(e.sourceNode);
    if (portMap) {
      if (!portMap.has(e.sourcePort)) {
        portMap.set(e.sourcePort, []);
      }
      portMap.get(e.sourcePort)?.push({ node: e.targetNode, port: e.targetPort });
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: External Type Resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolveExternalTypes(
  nodes: GraphNode[],
  resolver: TypeResolver,
  result: PortTypeMap
): void {
  for (const node of nodes) {
    for (const [portId, port] of Object.entries(node.ports)) {
      if (port.type.kind !== 'resolved') {
        continue;
      }

      const configValue = node.config?.[port.type.configField] as string | undefined;
      if (!configValue) {
        continue;
      }

      const resolved = resolver.resolve(port.type.source, configValue);
      if (resolved && isConcrete(resolved)) {
        result.set(portKey(node.id, portId), resolved);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Forward Propagation
// ─────────────────────────────────────────────────────────────────────────────

function propagateForward(
  node: GraphNode,
  incoming: IncomingMap,
  nodeMap: Map<string, GraphNode>,
  result: PortTypeMap
): boolean {
  let changed = false;
  const nodeIncoming = incoming.get(node.id);
  if (!nodeIncoming) {
    return false;
  }

  for (const [inputPortId, port] of Object.entries(node.ports)) {
    if (port.direction !== 'input') {
      continue;
    }

    const key = portKey(node.id, inputPortId);
    if (result.has(key)) {
      continue; // already resolved
    }

    const source = nodeIncoming.get(inputPortId);
    if (!source) {
      continue;
    }

    // Check if the source's declared type or its inferred type is concrete
    const sourceKey = portKey(source.node, source.port);
    const sourceType = result.get(sourceKey);

    if (sourceType && isConcrete(sourceType) && needsResolution(port.type)) {
      result.set(key, sourceType);
      changed = true;
    }
  }

  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Passthrough Resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolvePassthrough(node: GraphNode, result: PortTypeMap): boolean {
  let changed = false;

  for (const [portId, port] of Object.entries(node.ports)) {
    if (port.type.kind !== 'passthrough') {
      continue;
    }

    const key = portKey(node.id, portId);
    if (result.has(key)) {
      continue;
    }

    // Look up the referenced input port on the same node
    const sourceInputKey = portKey(node.id, port.type.sourcePortId);
    const resolvedInput = result.get(sourceInputKey);

    if (resolvedInput && isConcrete(resolvedInput)) {
      result.set(key, resolvedInput);
      changed = true;
    }
  }

  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Backward Propagation
// ─────────────────────────────────────────────────────────────────────────────

function propagateBackward(
  node: GraphNode,
  outgoing: OutgoingMap,
  nodeMap: Map<string, GraphNode>,
  result: PortTypeMap
): boolean {
  const nodeOutgoing = outgoing.get(node.id);
  if (!nodeOutgoing) {
    return false;
  }

  let changed = false;
  for (const [outputPortId, port] of Object.entries(node.ports)) {
    if (tryBackwardResolve(node.id, outputPortId, port, nodeOutgoing, result)) {
      changed = true;
    }
  }
  return changed;
}

function tryBackwardResolve(
  nodeId: string,
  outputPortId: string,
  port: GraphNode['ports'][string],
  nodeOutgoing: Map<string, EdgeTarget[]>,
  result: PortTypeMap
): boolean {
  if (port.direction !== 'output') {
    return false;
  }
  const key = portKey(nodeId, outputPortId);
  if (result.has(key) || !needsResolution(port.type)) {
    return false;
  }
  const targets = nodeOutgoing.get(outputPortId);
  if (!targets) {
    return false;
  }
  for (const target of targets) {
    const targetType = result.get(portKey(target.node, target.port));
    if (targetType && isConcrete(targetType)) {
      result.set(key, targetType);
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function portKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

export { portKey };
