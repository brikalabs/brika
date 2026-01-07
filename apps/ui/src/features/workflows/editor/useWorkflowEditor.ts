import {
  addEdge,
  type Connection,
  type Edge,
  MarkerType,
  type Node,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodesDelete,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Workflow, WorkflowBlock } from '../api';
import type { BlockNodeData, BlockPort } from './BlockNode';
import type { BlockDefinition, BlockTypeInfo } from './BlockToolbar';

// ─────────────────────────────────────────────────────────────────────────────
// Type Inference
// ─────────────────────────────────────────────────────────────────────────────

/** Extended port with original type tracking */
interface PortWithOriginal extends BlockPort {
  _originalType?: string;
}

/** Check if type is concrete (not generic/passthrough) */
const isConcrete = (t?: string) => t && !t.startsWith('generic') && !t.startsWith('passthrough');

/** Get original type (stored or current) */
const getOriginal = (p: PortWithOriginal) => p._originalType ?? p.typeName;

/**
 * Infer types for generic ports based on graph connections.
 * Stores original types in _originalType and computes display types.
 */
function inferPortTypes(nodes: Node[], edges: Edge[]): Node[] {
  // Build edge lookup: target -> { portId -> { sourceNodeId, sourcePortId } }
  const incoming = new Map<string, Map<string, { node: string; port: string }>>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, new Map());
    incoming.get(e.target)!.set(e.targetHandle || 'in', {
      node: e.source,
      port: e.sourceHandle || 'out',
    });
  }

  // First pass: ensure all ports have _originalType set
  const withOriginals = nodes.map((n) => {
    if (n.type !== 'block') return n;
    const d = n.data as BlockNodeData;
    return {
      ...n,
      data: {
        ...d,
        inputs: d.inputs?.map((p) => ({
          ...p,
          _originalType: (p as PortWithOriginal)._originalType ?? p.typeName,
        })),
        outputs: d.outputs?.map((p) => ({
          ...p,
          _originalType: (p as PortWithOriginal)._originalType ?? p.typeName,
        })),
      },
    };
  });

  // Build node lookup
  const nodeMap = new Map(
    withOriginals.filter((n) => n.type === 'block').map((n) => [n.id, n.data as BlockNodeData])
  );

  // Compute inferred types for each node
  const inferred = new Map<string, Map<string, string>>(); // nodeId -> portId -> inferredType

  // Run iterations to propagate through chains
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;

    for (const [nodeId, data] of nodeMap) {
      const nodeIncoming = incoming.get(nodeId);
      if (!inferred.has(nodeId)) inferred.set(nodeId, new Map());
      const nodeInferred = inferred.get(nodeId)!;

      // Infer input types from connected outputs
      for (const input of data.inputs || []) {
        const conn = nodeIncoming?.get(input.id);
        if (!conn) continue;

        const sourceData = nodeMap.get(conn.node);
        const sourcePort = sourceData?.outputs?.find((p) => p.id === conn.port);
        if (!sourcePort) continue;

        // Get source type (inferred or original)
        const sourceInferred = inferred.get(conn.node)?.get(conn.port);
        const sourceType = sourceInferred ?? getOriginal(sourcePort as PortWithOriginal);

        // If source has concrete type and this input is generic, infer it
        const origType = getOriginal(input as PortWithOriginal);
        if (isConcrete(sourceType) && origType?.startsWith('generic')) {
          if (nodeInferred.get(input.id) !== sourceType) {
            nodeInferred.set(input.id, sourceType!);
            changed = true;
          }
        }
      }

      // Infer output types from inputs (generic outputs get type from first input)
      for (const output of data.outputs || []) {
        const origType = getOriginal(output as PortWithOriginal);
        if (!origType?.startsWith('generic')) continue;

        // Find first input with inferred or concrete type
        const firstInput = data.inputs?.[0];
        if (!firstInput) continue;

        const inputInferred = nodeInferred.get(firstInput.id);
        const inputOrig = getOriginal(firstInput as PortWithOriginal);
        const inputType = inputInferred ?? (isConcrete(inputOrig) ? inputOrig : undefined);

        if (inputType && nodeInferred.get(output.id) !== inputType) {
          nodeInferred.set(output.id, inputType);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  // Apply inferred types to nodes
  return withOriginals.map((node) => {
    if (node.type !== 'block') return node;
    const data = node.data as BlockNodeData;
    const nodeInferred = inferred.get(node.id);

    return {
      ...node,
      data: {
        ...data,
        inputs: data.inputs?.map((p) => ({
          ...p,
          typeName: nodeInferred?.get(p.id) ?? getOriginal(p as PortWithOriginal),
        })),
        outputs: data.outputs?.map((p) => ({
          ...p,
          typeName: nodeInferred?.get(p.id) ?? getOriginal(p as PortWithOriginal),
        })),
      },
    };
  });
}

export type BlockStatus = 'idle' | 'running' | 'completed' | 'error';

export interface EditorState {
  workflow: Workflow;
  selectedNodeId: string | null;
  isDirty: boolean;
  blockStatuses: Record<string, BlockStatus>;
  blockOutputs: Record<string, unknown>;
  executionLogs: ExecutionLog[];
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  blockId: string;
  type: 'start' | 'complete' | 'error' | 'log';
  message: string;
  data?: unknown;
}

// Convert workflow to React Flow nodes and edges
function workflowToFlow(
  workflow: Workflow,
  blockDefs: BlockDefinition[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Build block definition lookup by both full ID and short ID
  const defMap = new Map<string, BlockDefinition>();
  for (const d of blockDefs) {
    defMap.set(d.id, d);
    if (d.type) defMap.set(d.type, d);
  }

  // Add block nodes
  const blocks = workflow.blocks || [];

  blocks.forEach((block, index) => {
    // Look up block definition to get inputs/outputs
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
        inputs: def?.inputs?.map((p) => ({
          id: p.id,
          direction: 'input' as const,
          typeName: p.typeName || 'generic<T>',
        })),
        outputs: def?.outputs?.map((p) => ({
          id: p.id,
          direction: 'output' as const,
          typeName: p.typeName || 'generic<T>',
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

// Convert React Flow nodes/edges back to workflow
function flowToWorkflow(nodes: Node[], edges: Edge[], originalWorkflow: Workflow): Workflow {
  const blockNodes = nodes.filter((n) => n.type === 'block');

  // Build blocks from nodes
  const blocks: WorkflowBlock[] = blockNodes.map((node) => {
    const data = node.data as BlockNodeData;
    return {
      id: node.id,
      type: data.type,
      position: node.position,
      config: data.config,
    };
  });

  // Build connections from edges
  const connections = edges.map((e) => ({
    from: e.source,
    fromPort: e.sourceHandle || undefined,
    to: e.target,
    toPort: e.targetHandle || undefined,
  }));

  // Only include known workflow properties (avoid spreading unknown props)
  return {
    id: originalWorkflow.id,
    name: originalWorkflow.name,
    enabled: originalWorkflow.enabled,
    blocks,
    connections,
  };
}

let nodeIdCounter = 0;

function generateNodeId(type: string): string {
  nodeIdCounter++;
  return `${type}-${Date.now().toString(36)}-${nodeIdCounter}`;
}

export function useWorkflowEditor(initialWorkflow: Workflow, blockDefs: BlockDefinition[]) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => workflowToFlow(initialWorkflow, blockDefs),
    [initialWorkflow, blockDefs]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockStatus>>({});
  const [blockOutputs, setBlockOutputs] = useState<Record<string, unknown>>({});
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  // Run type inference when graph changes (nodes or edges)
  useEffect(() => {
    const inferred = inferPortTypes(nodes, edges);
    // Only update if types actually changed
    const hasChanges = inferred.some((node, i) => {
      if (node.type !== 'block') return false;
      const oldData = nodes[i]?.data as BlockNodeData | undefined;
      const newData = node.data as BlockNodeData;
      return (
        JSON.stringify(oldData?.inputs?.map((p) => p.typeName)) !==
          JSON.stringify(newData?.inputs?.map((p) => p.typeName)) ||
        JSON.stringify(oldData?.outputs?.map((p) => p.typeName)) !==
          JSON.stringify(newData?.outputs?.map((p) => p.typeName))
      );
    });
    if (hasChanges) {
      setNodes(inferred);
    }
  }, [nodes, edges, setNodes]);

  // Get current workflow from nodes/edges
  const workflow = useMemo(
    () => flowToWorkflow(nodes, edges, initialWorkflow),
    [nodes, edges, initialWorkflow]
  );

  // Get selected node
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        ...connection,
        id: `${connection.source}-to-${connection.target}`,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      } as Edge;
      setEdges((eds) => addEdge(newEdge, eds));
      setIsDirty(true);
    },
    [setEdges]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Handle node deletion
  const onNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
      if (deletedNodes.some((n) => n.id === selectedNodeId)) {
        setSelectedNodeId(null);
      }
      setIsDirty(true);
    },
    [selectedNodeId]
  );

  // Handle edge deletion
  const onEdgesDelete: OnEdgesDelete = useCallback(() => {
    setIsDirty(true);
  }, []);

  // Add new block from toolbar
  const addBlock = useCallback(
    (blockType: BlockTypeInfo, position: { x: number; y: number }) => {
      const blockTypeId = blockType.type || blockType.name;
      const nodeId = generateNodeId(blockTypeId.split(':').pop() || 'block');
      const newNode: Node = {
        id: nodeId,
        type: 'block',
        position,
        data: {
          id: nodeId,
          type: blockTypeId,
          label: blockType.name || nodeId,
          config: { id: nodeId, type: blockTypeId, ...blockType.defaultConfig },
          icon: blockType.icon,
          color: blockType.color,
          inputs: blockType.inputs,
          outputs: blockType.outputs,
          isFirst: false,
          isLast: blockTypeId.includes('end'),
          status: 'idle',
        } as BlockNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(nodeId);
      setIsDirty(true);
      return nodeId;
    },
    [setNodes]
  );

  // Update block config
  const updateBlockConfig = useCallback(
    (nodeId: string, config: Partial<WorkflowBlock>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId && node.type === 'block') {
            const data = node.data as BlockNodeData;
            return {
              ...node,
              data: {
                ...data,
                config: { ...data.config, ...config },
              },
            };
          }
          return node;
        })
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  // Set block status (for debugging)
  const setBlockStatus = useCallback(
    (blockId: string, status: BlockStatus, output?: unknown) => {
      setBlockStatuses((prev) => ({ ...prev, [blockId]: status }));
      if (output !== undefined) {
        setBlockOutputs((prev) => ({ ...prev, [blockId]: output }));
      }
      // Update node data
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === blockId && node.type === 'block') {
            return {
              ...node,
              data: { ...node.data, status },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Add execution log
  const addExecutionLog = useCallback((log: Omit<ExecutionLog, 'id' | 'timestamp'>) => {
    setExecutionLogs((prev) => [
      ...prev,
      { ...log, id: crypto.randomUUID(), timestamp: Date.now() },
    ]);
  }, []);

  // Clear execution state
  const clearExecutionState = useCallback(() => {
    setBlockStatuses({});
    setBlockOutputs({});
    setExecutionLogs([]);
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === 'block') {
          return { ...node, data: { ...node.data, status: 'idle' } };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Get available variables at a given block position
  // Variables use the pattern: inputs.{portId} for incoming data
  const getAvailableVariables = useCallback(
    (blockId: string) => {
      const variables: { name: string; source: string; type: string }[] = [];

      const blockNodes = nodes.filter((n) => n.type === 'block');
      const targetNode = blockNodes.find((n) => n.id === blockId);
      const incomingEdges = edges.filter((e) => e.target === blockId);

      // Add input variables for each connected input port
      incomingEdges.forEach((edge) => {
        const sourceNode = blockNodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          const sourceData = sourceNode.data as BlockNodeData;
          const sourcePortId = edge.sourceHandle || 'out';
          const targetPortId = edge.targetHandle || 'in';
          const outputPort = sourceData.outputs?.find((p) => p.id === sourcePortId);

          // Use inputs.{targetPortId} pattern (e.g., inputs.in, inputs.a)
          variables.push({
            name: `inputs.${targetPortId}`,
            source: `from ${sourceNode.id}`,
            type: outputPort?.typeName ?? 'generic',
          });
        }
      });

      // Add config variables if the block has config schema
      if (targetNode) {
        const targetData = targetNode.data as BlockNodeData;
        if (targetData.config && Object.keys(targetData.config).length > 0) {
          for (const key of Object.keys(targetData.config)) {
            variables.push({
              name: `config.${key}`,
              source: 'block config',
              type: typeof targetData.config[key],
            });
          }
        }
      }

      return variables;
    },
    [nodes, edges]
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onPaneClick,
    onNodesDelete,
    onEdgesDelete,
    workflow,
    selectedNodeId,
    selectedNode,
    isDirty,
    addBlock,
    updateBlockConfig,
    setSelectedNodeId,
    blockStatuses,
    blockOutputs,
    executionLogs,
    setBlockStatus,
    addExecutionLog,
    clearExecutionState,
    getAvailableVariables,
  };
}
