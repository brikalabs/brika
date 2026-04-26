/**
 * Pure conversions between workflow JSON, XYFlow graph nodes/edges,
 * and the type-system's GraphNode shape — plus the variable-collection
 * helpers used by the config panel.
 *
 * No React. No hooks. Tested in isolation.
 */

import {
  type GraphEdge,
  type GraphNode,
  getCompletions,
  type PortTypeMap,
  parsePortType,
  portKey,
} from '@brika/type-system';
import { type Edge, MarkerType, type Node } from '@xyflow/react';
import type { Workflow, WorkflowBlock } from '../api';
import type { BlockNodeData } from './BlockNode';
import type { BlockDefinition } from './BlockToolbar';

export type BlockStatus = 'idle' | 'running' | 'completed' | 'error';

export interface ExecutionLog {
  id: string;
  timestamp: number;
  blockId: string;
  type: 'start' | 'complete' | 'error' | 'log';
  message: string;
  data?: unknown;
}

export interface AvailableVariable {
  name: string;
  source: string;
  type: string;
}

/* ─── XYFlow ↔ type-system graph conversion ─────────────────── */

/** Convert XYFlow nodes to GraphNode[] for the type inference engine. */
export function nodesToGraphNodes(nodes: Node[]): GraphNode[] {
  return nodes
    .filter((n) => n.type === 'block')
    .map((n) => {
      const data = n.data as BlockNodeData;
      const ports: GraphNode['ports'] = {};

      for (const input of data.inputs ?? []) {
        ports[input.id] = {
          direction: 'input',
          type: parsePortType(input),
        };
      }
      for (const output of data.outputs ?? []) {
        ports[output.id] = {
          direction: 'output',
          type: parsePortType(output),
        };
      }

      return {
        id: n.id,
        ports,
        config: data.config,
      };
    });
}

/** Convert XYFlow edges to GraphEdge[] for the type inference engine. */
export function edgesToGraphEdges(edges: Edge[]): GraphEdge[] {
  return edges.map((e) => ({
    sourceNode: e.source,
    sourcePort: e.sourceHandle ?? 'out',
    targetNode: e.target,
    targetPort: e.targetHandle ?? 'in',
  }));
}

/* ─── Variable collection (used by ExpressionInput auto-complete) ─ */

export function collectInputVariables(
  edge: Edge,
  blockNodes: Node[],
  portTypeMap: PortTypeMap
): AvailableVariable[] {
  const sourceNode = blockNodes.find((n) => n.id === edge.source);
  if (!sourceNode) {
    return [];
  }
  const sourcePortId = edge.sourceHandle || 'out';
  const targetPortId = edge.targetHandle || 'in';
  const resolvedType = portTypeMap.get(portKey(sourceNode.id, sourcePortId));

  if (resolvedType) {
    return getCompletions(resolvedType, `inputs.${targetPortId}`, 3).map((item) => ({
      name: item.path,
      source: `from ${sourceNode.id}`,
      type: item.type,
    }));
  }

  const sourceData = sourceNode.data as BlockNodeData;
  const outputPort = sourceData.outputs?.find((p) => p.id === sourcePortId);
  return [
    {
      name: `inputs.${targetPortId}`,
      source: `from ${sourceNode.id}`,
      type: outputPort?.typeName ?? 'generic',
    },
  ];
}

export function collectConfigVariables(data: BlockNodeData): AvailableVariable[] {
  if (!data.config || Object.keys(data.config).length === 0) {
    return [];
  }
  return Object.keys(data.config).map((key) => ({
    name: `config.${key}`,
    source: 'block config',
    type: typeof data.config?.[key],
  }));
}

/* ─── Workflow ↔ flow conversion ────────────────────────────── */

/** Convert workflow JSON to React Flow nodes and edges. */
export function workflowToFlow(
  workflow: Workflow,
  blockDefs: BlockDefinition[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Build block definition lookup by both full ID and short ID
  const defMap = new Map<string, BlockDefinition>();
  for (const d of blockDefs) {
    defMap.set(d.id, d);
    if (d.type) {
      defMap.set(d.type, d);
    }
  }

  // Add block nodes
  const blocks = workflow.blocks || [];

  blocks.forEach((block, index) => {
    const def = defMap.get(block.type);

    nodes.push({
      id: block.id,
      type: 'block',
      position: block.position ?? { x: 300, y: 50 + index * 140 },
      data: {
        id: block.id,
        type: block.type,
        label: def?.name || block.id,
        config: block.config || {},
        icon: def?.icon,
        color: def?.color,
        pluginId: def?.pluginId,
        inputs: def?.inputs?.map((p) => ({
          id: p.id,
          name: p.name || p.id,
          direction: 'input' as const,
          typeName: p.typeName || 'generic<T>',
          type: p.type,
        })),
        outputs: def?.outputs?.map((p) => ({
          id: p.id,
          name: p.name || p.id,
          direction: 'output' as const,
          typeName: p.typeName || 'generic<T>',
          type: p.type,
        })),
        status: 'idle',
      } as BlockNodeData,
    });
  });

  // Create edges from workflow-level connections
  for (const conn of workflow.connections || []) {
    edges.push({
      id: `${conn.from}:${conn.fromPort || 'out'}->${conn.to}:${conn.toPort || 'in'}`,
      source: conn.from,
      sourceHandle: conn.fromPort || 'out',
      target: conn.to,
      targetHandle: conn.toPort || 'in',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  }

  return { nodes, edges };
}

/** Convert React Flow nodes/edges back to a workflow object. */
export function flowToWorkflow(nodes: Node[], edges: Edge[], originalWorkflow: Workflow): Workflow {
  const blockNodes = nodes.filter((n) => n.type === 'block');

  const blocks: WorkflowBlock[] = blockNodes.map((node) => {
    const data = node.data as BlockNodeData;
    return {
      id: node.id,
      type: data.type,
      position: node.position,
      config: data.config,
    };
  });

  const connections = edges.map((e) => ({
    from: e.source,
    fromPort: e.sourceHandle || undefined,
    to: e.target,
    toPort: e.targetHandle || undefined,
  }));

  return {
    id: originalWorkflow.id,
    name: originalWorkflow.name,
    enabled: originalWorkflow.enabled,
    blocks,
    connections,
  };
}

/* ─── Node id generator ─────────────────────────────────────── */

let nodeIdCounter = 0;

export function generateNodeId(type: string): string {
  nodeIdCounter++;
  return `${type}-${Date.now().toString(36)}-${nodeIdCounter}`;
}
