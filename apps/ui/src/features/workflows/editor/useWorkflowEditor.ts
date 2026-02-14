import { arePortTypesCompatible } from '@brika/shared';
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

// ─────────────────────────────────────────────────────────────────────────────
// Type Inference System
// ─────────────────────────────────────────────────────────────────────────────

/** Extended port with original type tracking */
interface PortWithOriginal extends BlockPort {
  _originalType?: string;
}

/** Check if type is concrete (not generic/passthrough/unknown/any/resolved) */
const isConcrete = (t?: string) =>
  t &&
  !t.startsWith('generic') &&
  !t.startsWith('passthrough') &&
  !t.startsWith('$resolve:') &&
  t !== 'unknown' &&
  t !== 'any';

/** Check if type is generic (accepts any) */
const isGeneric = (t?: string) =>
  !t || t.startsWith('generic') || t.startsWith('passthrough') || t === 'unknown' || t === 'any';

/** Check if type is a resolve marker ($resolve:source:configField) */
const isResolveMarker = (t?: string) => t?.startsWith('$resolve:');

/** Parse a resolve marker into source and config field */
function parseResolveMarker(t: string): { source: string; configField: string } | null {
  if (!t.startsWith('$resolve:')) return null;
  const parts = t.slice('$resolve:'.length).split(':');
  if (parts.length < 2) return null;
  return { source: parts[0], configField: parts[1] };
}

/** Get original type (stored or current) */
const getOriginal = (p: PortWithOriginal) => p._originalType ?? p.typeName;

export interface TypeResolverContext {
  /** Lookup external data (e.g., spark schemas) */
  lookup: <T>(key: string) => T | undefined;
}

/** Spark entry for type resolution */
interface SparkEntry {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

/** Convert JSON schema to TypeScript-like type string */
function jsonSchemaToTypeName(schema: Record<string, unknown> | undefined): string {
  if (!schema) return 'unknown';
  const type = schema.type as string | undefined;
  if (type === 'string') return 'string';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'null') return 'null';
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    return `${jsonSchemaToTypeName(items)}[]`;
  }
  if (type === 'object') {
    const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return '{}';
    const entries = Object.entries(props)
      .map(([k, v]) => `${k}: ${jsonSchemaToTypeName(v)}`)
      .join(', ');
    return `{${entries}}`;
  }
  return 'unknown';
}

/** Build edge lookup maps for type inference */
function buildEdgeLookups(edges: Edge[]) {
  const incoming = new Map<string, Map<string, { node: string; port: string }>>();
  const outgoing = new Map<string, Map<string, Array<{ node: string; port: string }>>>();

  for (const e of edges) {
    // Incoming edges
    if (!incoming.has(e.target)) incoming.set(e.target, new Map());
    incoming.get(e.target)!.set(e.targetHandle || 'in', {
      node: e.source,
      port: e.sourceHandle || 'out',
    });

    // Outgoing edges
    if (!outgoing.has(e.source)) outgoing.set(e.source, new Map());
    const sourcePort = e.sourceHandle || 'out';
    if (!outgoing.get(e.source)!.has(sourcePort)) {
      outgoing.get(e.source)!.set(sourcePort, []);
    }
    outgoing
      .get(e.source)!
      .get(sourcePort)!
      .push({
        node: e.target,
        port: e.targetHandle || 'in',
      });
  }

  return { incoming, outgoing };
}

/** Add original type tracking to all ports */
function addOriginalTypesToNodes(nodes: Node[]): Node[] {
  return nodes.map((n) => {
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
}

/** Resolve a single port's type from external sources */
function resolvePortType(
  port: BlockPort,
  data: BlockNodeData,
  resolverContext: TypeResolverContext
): string | null {
  const origType = getOriginal(port as PortWithOriginal);
  if (!isResolveMarker(origType)) return null;

  const marker = parseResolveMarker(origType!);
  if (!marker) return null;

  const lookupKey = data.config?.[marker.configField] as string | undefined;
  if (!lookupKey) return null;

  if (marker.source === 'spark') {
    const sparks = resolverContext.lookup<SparkEntry[]>('sparks');
    const spark = sparks?.find((s) => s.type === lookupKey);
    if (spark?.schema) return jsonSchemaToTypeName(spark.schema);
  }

  return null;
}

/** Resolve types from external sources ($resolve: markers) */
function resolveExternalTypes(
  nodeMap: Map<string, BlockNodeData>,
  resolverContext: TypeResolverContext
): Map<string, Map<string, string>> {
  const inferred = new Map<string, Map<string, string>>();

  for (const [nodeId, data] of nodeMap) {
    for (const port of data.outputs || []) {
      const resolvedType = resolvePortType(port, data, resolverContext);
      if (resolvedType) {
        if (!inferred.has(nodeId)) inferred.set(nodeId, new Map());
        inferred.get(nodeId)!.set(port.id, resolvedType);
      }
    }
  }

  return inferred;
}

/** Infer input type from connected output */
function inferInputTypeFromConnection(
  input: BlockPort,
  nodeId: string,
  nodeIncoming: Map<string, { node: string; port: string }> | undefined,
  nodeMap: Map<string, BlockNodeData>,
  inferred: Map<string, Map<string, string>>
): string | undefined {
  const conn = nodeIncoming?.get(input.id);
  if (!conn) return undefined;

  const sourceData = nodeMap.get(conn.node);
  const sourcePort = sourceData?.outputs?.find((p) => p.id === conn.port);
  if (!sourcePort) return undefined;

  const sourceInferred = inferred.get(conn.node)?.get(conn.port);
  const sourceType = sourceInferred ?? getOriginal(sourcePort as PortWithOriginal);

  const origType = getOriginal(input as PortWithOriginal);
  if (isConcrete(sourceType) && isGeneric(origType)) {
    return sourceType!;
  }

  return undefined;
}

/** Infer output type from inputs (passthrough) */
function inferOutputTypeFromInputs(
  output: BlockPort,
  data: BlockNodeData,
  nodeInferred: Map<string, string>
): string | undefined {
  if (nodeInferred.has(output.id) && isConcrete(nodeInferred.get(output.id))) {
    return undefined;
  }

  const origType = getOriginal(output as PortWithOriginal);
  if (!isGeneric(origType)) return undefined;

  for (const input of data.inputs || []) {
    const inputInferred = nodeInferred.get(input.id);
    const inputOrig = getOriginal(input as PortWithOriginal);
    const inputType = inputInferred ?? (isConcrete(inputOrig) ? inputOrig : undefined);

    if (inputType && isConcrete(inputType)) {
      return inputType;
    }
  }

  return undefined;
}

/** Process a single node's type inference, returns true if any type changed */
function inferNodeTypes(
  nodeId: string,
  data: BlockNodeData,
  incoming: Map<string, Map<string, { node: string; port: string }>>,
  nodeMap: Map<string, BlockNodeData>,
  inferred: Map<string, Map<string, string>>
): boolean {
  const nodeIncoming = incoming.get(nodeId);
  if (!inferred.has(nodeId)) inferred.set(nodeId, new Map());
  const nodeInferred = inferred.get(nodeId)!;
  let changed = false;

  for (const input of data.inputs || []) {
    const inferredType = inferInputTypeFromConnection(
      input,
      nodeId,
      nodeIncoming,
      nodeMap,
      inferred
    );
    if (inferredType && nodeInferred.get(input.id) !== inferredType) {
      nodeInferred.set(input.id, inferredType);
      changed = true;
    }
  }

  for (const output of data.outputs || []) {
    const inferredType = inferOutputTypeFromInputs(output, data, nodeInferred);
    if (inferredType && nodeInferred.get(output.id) !== inferredType) {
      nodeInferred.set(output.id, inferredType);
      changed = true;
    }
  }

  return changed;
}

/** Propagate types through connections iteratively */
function propagateTypesIteratively(
  nodeMap: Map<string, BlockNodeData>,
  incoming: Map<string, Map<string, { node: string; port: string }>>,
  inferred: Map<string, Map<string, string>>
): void {
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;

    for (const [nodeId, data] of nodeMap) {
      if (inferNodeTypes(nodeId, data, incoming, nodeMap, inferred)) {
        changed = true;
      }
    }

    if (!changed) break;
  }
}

/** Apply inferred types back to nodes */
function applyInferredTypes(nodes: Node[], inferred: Map<string, Map<string, string>>): Node[] {
  return nodes.map((node) => {
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

/**
 * Infer types for generic ports based on:
 * 1. Resolve markers ($resolve:source:configField) - type resolved from external data
 * 2. Graph connections (types flow from outputs to connected inputs)
 * 3. Passthrough blocks (generic outputs inherit from first input)
 */
function inferPortTypes(
  nodes: Node[],
  edges: Edge[],
  resolverContext: TypeResolverContext
): Node[] {
  const { incoming } = buildEdgeLookups(edges);
  const withOriginals = addOriginalTypesToNodes(nodes);
  const nodeMap = new Map(
    withOriginals.filter((n) => n.type === 'block').map((n) => [n.id, n.data as BlockNodeData])
  );

  // Phase 1: Resolve external types
  const inferred = resolveExternalTypes(nodeMap, resolverContext);

  // Phase 2: Propagate types through connections
  propagateTypesIteratively(nodeMap, incoming, inferred);

  // Apply inferred types to nodes
  return applyInferredTypes(withOriginals, inferred);
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
        pluginId: def?.pluginId,
        inputs: def?.inputs?.map((p) => ({
          id: p.id,
          name: p.name || p.id,
          direction: 'input' as const,
          typeName: p.typeName || 'generic<T>',
        })),
        outputs: def?.outputs?.map((p) => ({
          id: p.id,
          name: p.name || p.id,
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

  // Type resolver context with lookup function
  const resolverContext = useMemo<TypeResolverContext>(
    () => ({
      lookup: options?.typeLookup ?? (() => undefined),
    }),
    [options?.typeLookup]
  );

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

  // Run type inference when graph changes (nodes, edges, or resolver context)
  useEffect(() => {
    const inferred = inferPortTypes(nodes, edges, resolverContext);
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
  }, [nodes, edges, resolverContext, setNodes]);

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

  // Validate connection compatibility
  const isValidConnection = useCallback(
    (connection: Edge | Connection): boolean => {
      // Don't allow self-connections
      if (connection.source === connection.target) return false;

      // Find source and target nodes
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceData = sourceNode.data as BlockNodeData;
      const targetData = targetNode.data as BlockNodeData;

      // Find the specific ports
      const sourcePort = sourceData.outputs?.find(
        (p) => p.id === (connection.sourceHandle || 'out')
      );
      const targetPort = targetData.inputs?.find((p) => p.id === (connection.targetHandle || 'in'));

      if (!sourcePort || !targetPort) return false;

      // Check type compatibility
      return arePortTypesCompatible(sourcePort.typeName, targetPort.typeName);
    },
    [nodes]
  );

  // Handle new connections (enforces single connection per port)
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        ...connection,
        id: `${connection.source}:${connection.sourceHandle || 'out'}->${connection.target}:${connection.targetHandle || 'in'}`,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
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
    (blockType: BlockTypeInfo, position: { x: number; y: number }) => {
      const blockTypeId = blockType.type || blockType.name;
      const nodeId = generateNodeId(blockTypeId.split(':').pop() || 'block');
      // Use translated label if available (from drag data), otherwise fall back to name
      const label =
        (blockType as BlockTypeInfo & { translatedLabel?: string }).translatedLabel ||
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
          config: { ...blockType.defaultConfig },
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

  // Mark workflow as clean (after successful save)
  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

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
    markClean,
  };
}
