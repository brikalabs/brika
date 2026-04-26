import {
  fromJsonSchema,
  inferTypes,
  isCompatible,
  type PortTypeMap,
  parseTypeName,
  portKey,
  type TypeDescriptor,
  type TypeResolver,
} from '@brika/type-system';
import {
  addEdge,
  type Connection,
  type Edge,
  MarkerType,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodesDelete,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Workflow, WorkflowBlock } from '../api';
import type { BlockNodeData, BlockPort } from './BlockNode';
import type { BlockDefinition, BlockTypeInfo } from './BlockToolbar';
import type { RegisteredSpark } from './WorkflowEditor';
import {
  collectConfigVariables,
  collectInputVariables,
  edgesToGraphEdges,
  flowToWorkflow,
  generateNodeId,
  nodesToGraphNodes,
  workflowToFlow,
} from './workflow-conversion';

// Re-export so existing consumers (BlockNode, editor barrel) keep working.
export type { BlockStatus, ExecutionLog } from './workflow-conversion';

import type { BlockStatus, ExecutionLog } from './workflow-conversion';

export interface EditorState {
  workflow: Workflow;
  selectedNodeId: string | null;
  isDirty: boolean;
  blockStatuses: Record<string, BlockStatus>;
  blockOutputs: Record<string, unknown>;
  executionLogs: ExecutionLog[];
}

export interface UseWorkflowEditorOptions {
  /** Lookup function for external type data (e.g., spark schemas) */
  typeLookup?: <T>(key: string) => T | undefined;
}

export function useWorkflowEditor(
  initialWorkflow: Workflow,
  blockDefs: BlockDefinition[],
  onChange?: (workflow: Workflow, isDirty: boolean) => void,
  options?: UseWorkflowEditorOptions
) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => workflowToFlow(initialWorkflow, blockDefs),
    [initialWorkflow, blockDefs]
  );

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockStatus>>({});
  const [blockOutputs, setBlockOutputs] = useState<Record<string, unknown>>({});
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  // Track onChange callback in ref to avoid stale closures
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Build block schema map for type inference
  const blockSchemaMap = useMemo(() => {
    const map: Record<string, BlockDefinition> = {};
    for (const def of blockDefs) {
      map[def.type ?? def.id] = def;
    }
    return map;
  }, [blockDefs]);

  // Type resolver for external sources (e.g., spark schemas)
  const typeResolver = useMemo<TypeResolver | undefined>(() => {
    const lookup = options?.typeLookup;
    if (!lookup) {
      return undefined;
    }
    return {
      resolve(source: string, key: string): TypeDescriptor | null {
        if (source === 'spark') {
          const sparks = lookup<RegisteredSpark[]>('sparks');
          if (!sparks) {
            return null;
          }
          const spark = sparks.find((s) => s.type === key || s.id === key);
          if (!spark?.schema) {
            return null;
          }
          return fromJsonSchema(spark.schema);
        }
        return null;
      },
    };
  }, [options?.typeLookup]);

  // Reset dirty state when initialWorkflow changes (after save)
  // This happens when parent calls setInitialWorkflow with the saved workflow
  useEffect(() => {
    setIsDirty(false);
  }, [initialWorkflow]);

  // Wrap onNodesChange to detect position changes and mark dirty
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChangeBase(changes);

      // Check if any change affects position (drag end)
      const hasPositionChange = changes.some(
        (change) => change.type === 'position' && change.dragging === false
      );

      if (hasPositionChange) {
        setIsDirty(true);
      }
    },
    [onNodesChangeBase]
  );

  // Wrap onEdgesChange to mark dirty
  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      onEdgesChangeBase(changes);
      // Any edge change is considered a change
      if (changes.length > 0) {
        setIsDirty(true);
      }
    },
    [onEdgesChangeBase]
  );

  // Memoize graph conversions separately — position-only node changes
  // won't retrigger type inference since ports/types haven't changed
  const graphNodes = useMemo(() => nodesToGraphNodes(nodes), [nodes]);
  const graphEdges = useMemo(() => edgesToGraphEdges(edges), [edges]);

  // Pure derived type inference — no useEffect/setNodes cascade
  const portTypeMap: PortTypeMap = useMemo(
    () => inferTypes(graphNodes, graphEdges, typeResolver),
    [graphNodes, graphEdges, typeResolver]
  );

  // Get current workflow from nodes/edges
  const workflow = useMemo(
    () => flowToWorkflow(nodes, edges, initialWorkflow),
    [nodes, edges, initialWorkflow]
  );

  // Notify parent of workflow changes
  useEffect(() => {
    onChangeRef.current?.(workflow, isDirty);
  }, [workflow, isDirty]);

  // Get selected node
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // Validate connection compatibility using structural type checking
  const isValidConnection = useCallback(
    (connection: Edge | Connection): boolean => {
      // Don't allow self-connections
      if (connection.source === connection.target) {
        return false;
      }

      // Find source and target nodes
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) {
        return false;
      }

      const sourceData = sourceNode.data as BlockNodeData;
      const targetData = targetNode.data as BlockNodeData;

      // Find the specific ports
      const sourcePortId = connection.sourceHandle || 'out';
      const targetPortId = connection.targetHandle || 'in';
      const sourcePort = sourceData.outputs?.find((p) => p.id === sourcePortId);
      const targetPort = targetData.inputs?.find((p) => p.id === targetPortId);

      if (!sourcePort || !targetPort) {
        return false;
      }

      // Use resolved types from inference when available, fall back to declared types
      const outputType =
        portTypeMap.get(portKey(sourceNode.id, sourcePortId)) ?? parseTypeName(sourcePort.typeName);
      const inputType =
        portTypeMap.get(portKey(targetNode.id, targetPortId)) ?? parseTypeName(targetPort.typeName);

      return isCompatible(outputType, inputType);
    },
    [nodes, portTypeMap]
  );

  // Handle new connections (enforces single connection per port)
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        ...connection,
        id: `${connection.source}:${connection.sourceHandle || 'out'}->${connection.target}:${connection.targetHandle || 'in'}`,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      } as Edge;

      setEdges((eds) => {
        // Remove any existing edge connected to the same target port (input)
        // Remove any existing edge connected to the same source port (output)
        const filtered = eds.filter((e) => {
          const sameTargetPort =
            e.target === connection.target &&
            (e.targetHandle || 'in') === (connection.targetHandle || 'in');
          const sameSourcePort =
            e.source === connection.source &&
            (e.sourceHandle || 'out') === (connection.sourceHandle || 'out');
          return !sameTargetPort && !sameSourcePort;
        });
        return addEdge(newEdge, filtered);
      });
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
    (
      blockType: BlockTypeInfo,
      position: {
        x: number;
        y: number;
      }
    ) => {
      const blockTypeId = blockType.type || blockType.name;
      const nodeId = generateNodeId(blockTypeId.split(':').pop() || 'block');
      // Use translated label if available (from drag data), otherwise fall back to name
      const label =
        (
          blockType as BlockTypeInfo & {
            translatedLabel?: string;
          }
        ).translatedLabel ||
        blockType.name ||
        nodeId;
      const newNode: Node = {
        id: nodeId,
        type: 'block',
        position,
        data: {
          id: nodeId,
          type: blockTypeId,
          label,
          config: {
            ...blockType.defaultConfig,
          },
          icon: blockType.icon,
          color: blockType.color,
          pluginId: blockType.pluginId,
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

  // Update block config (targeted — only creates new object for the changed node)
  const updateBlockConfig = useCallback(
    (nodeId: string, config: Partial<WorkflowBlock>) => {
      setNodes((nds) => {
        const idx = nds.findIndex((n) => n.id === nodeId);
        if (idx === -1) {
          return nds;
        }
        const node = nds[idx];
        if (node.type !== 'block') {
          return nds;
        }
        const data = node.data as BlockNodeData;
        const updated = [...nds];
        updated[idx] = {
          ...node,
          data: {
            ...data,
            config: {
              ...data.config,
              ...config,
            },
          },
        };
        return updated;
      });
      setIsDirty(true);
    },
    [setNodes]
  );

  // Set block status (for debugging)
  const setBlockStatus = useCallback(
    (blockId: string, status: BlockStatus, output?: unknown) => {
      setBlockStatuses((prev) => ({
        ...prev,
        [blockId]: status,
      }));
      if (output !== undefined) {
        setBlockOutputs((prev) => ({
          ...prev,
          [blockId]: output,
        }));
      }
      // Update node data
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === blockId && node.type === 'block') {
            return {
              ...node,
              data: {
                ...node.data,
                status,
              },
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
      {
        ...log,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      },
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
          return {
            ...node,
            data: {
              ...node.data,
              status: 'idle',
            },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Mark workflow as clean (after successful save)
  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  const getAvailableVariables = useCallback(
    (blockId: string) => {
      const blockNodes = nodes.filter((n) => n.type === 'block');
      const targetNode = blockNodes.find((n) => n.id === blockId);
      const incomingEdges = edges.filter((e) => e.target === blockId);

      const inputVars = incomingEdges.flatMap((edge) =>
        collectInputVariables(edge, blockNodes, portTypeMap)
      );
      const configVars = targetNode ? collectConfigVariables(targetNode.data as BlockNodeData) : [];

      return [...inputVars, ...configVars];
    },
    [nodes, edges, portTypeMap]
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
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
    portTypeMap,
    blockSchemaMap,
    markClean,
  };
}
