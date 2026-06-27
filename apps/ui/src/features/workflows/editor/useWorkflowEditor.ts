import {
  fromJsonSchema,
  inferTypes,
  isCompatible,
  type PortTypeMap,
  parsePortType,
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
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Workflow, WorkflowBlock } from '../api';
import type { BlockNodeData } from './BlockNode';
import type { BlockDefinition, BlockTypeInfo } from './BlockToolbar';
import { expandDynamicPorts, portsEqual } from './dynamic-ports';
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
export type { BlockStatus } from './workflow-conversion';

import type { BlockStatus } from './workflow-conversion';

export interface UseWorkflowEditorOptions {
  /** Lookup function for external type data (e.g., spark schemas) */
  typeLookup?: <T>(key: string) => T | undefined;
}

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 100;

/** Where to attach the new node when adding a block pre-wired to an existing port. */
export interface ConnectionOrigin {
  nodeId: string;
  handleId: string;
  handleType: 'source' | 'target';
}

/** Build a canvas edge with the canonical id/arrow/curve for a wire. */
function buildEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): Edge {
  return {
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

/** Build a fresh canvas node for a block type (shared by plain and wired adds). */
function buildBlockNode(blockType: BlockTypeInfo, position: { x: number; y: number }): Node {
  const blockTypeId = blockType.type || blockType.name;
  const nodeId = generateNodeId(blockTypeId.split(':').pop() || 'block');
  // Use translated label if available (from drag data), otherwise fall back to name
  const label = blockType.translatedLabel || blockType.name || nodeId;
  const data: BlockNodeData = {
    id: nodeId,
    type: blockTypeId,
    label,
    config: {
      ...blockType.defaultConfig,
    },
    icon: blockType.icon,
    color: blockType.color,
    pluginId: blockType.pluginId,
    pluginUid: blockType.pluginUid,
    nodeModuleUrl: blockType.nodeModuleUrl,
    inputs: blockType.inputs,
    outputs: expandDynamicPorts(blockType.outputs, { ...blockType.defaultConfig }),
    isFirst: false,
    isLast: blockTypeId.includes('end'),
    status: 'idle',
  };
  return {
    id: nodeId,
    type: 'block',
    position,
    data,
  };
}

/**
 * Return the previous value while its JSON signature is unchanged, so
 * downstream memos keyed on the value skip recomputation when a new object is
 * structurally identical.
 */
function useSignatureMemo<T>(value: T): T {
  const signature = JSON.stringify(value);
  const ref = useRef({ signature, value });
  if (ref.current.signature !== signature) {
    ref.current = { signature, value };
  }
  return ref.current.value;
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
  const [blockOutputs, setBlockOutputs] = useState<Record<string, unknown>>({});
  // Last emitted value per "blockId:port", feeding live previews and the
  // client-side {{ }} resolution of node-body views.
  const [portValues, setPortValues] = useState<Record<string, unknown>>({});

  // Track onChange callback in ref to avoid stale closures
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Undo/redo history. Snapshots hold the immutable nodes/edges arrays from
  // before a structural mutation; refs keep snapshotting out of the render
  // path while historyVersion re-renders consumers of canUndo/canRedo.
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const takeSnapshot = useCallback(() => {
    // Dedupe: node+edge deletions of one gesture both land here in the same
    // batch (refs unchanged), and that must stay a single undo step.
    const top = pastRef.current.at(-1);
    if (top?.nodes === nodesRef.current && top?.edges === edgesRef.current) {
      return;
    }
    pastRef.current = [
      ...pastRef.current.slice(-(MAX_HISTORY - 1)),
      { nodes: nodesRef.current, edges: edgesRef.current },
    ];
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const previous = pastRef.current.at(-1);
    if (!previous) {
      return;
    }
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [
      ...futureRef.current,
      { nodes: nodesRef.current, edges: edgesRef.current },
    ];
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setIsDirty(true);
    setHistoryVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = futureRef.current.at(-1);
    if (!next) {
      return;
    }
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, { nodes: nodesRef.current, edges: edgesRef.current }];
    setNodes(next.nodes);
    setEdges(next.edges);
    setIsDirty(true);
    setHistoryVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  // historyVersion is the dependency that keeps these in sync with the refs.
  const canUndo = useMemo(
    () => historyVersion >= 0 && pastRef.current.length > 0,
    [historyVersion]
  );
  const canRedo = useMemo(
    () => historyVersion >= 0 && futureRef.current.length > 0,
    [historyVersion]
  );

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

  // Tracks whether the in-flight drag already snapshotted, so a multi-event
  // drag produces a single undo step.
  const dragSnapshotTakenRef = useRef(false);

  // Wrap onNodesChange to snapshot history and mark dirty on real mutations
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const dragStarted = changes.some(
        (change) => change.type === 'position' && change.dragging === true
      );
      const removed = changes.some((change) => change.type === 'remove');
      if (removed || (dragStarted && !dragSnapshotTakenRef.current)) {
        takeSnapshot();
      }
      if (dragStarted) {
        dragSnapshotTakenRef.current = true;
      }

      onNodesChangeBase(changes);

      // Check if any change affects position (drag end)
      const hasPositionChange = changes.some(
        (change) => change.type === 'position' && change.dragging === false
      );

      if (hasPositionChange) {
        dragSnapshotTakenRef.current = false;
        setIsDirty(true);
      }
    },
    [onNodesChangeBase, takeSnapshot]
  );

  // Wrap onEdgesChange to snapshot history and mark dirty on real mutations
  // (selection changes don't count as edits).
  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      const mutated = changes.some((change) => change.type === 'remove' || change.type === 'add');
      if (changes.some((change) => change.type === 'remove')) {
        takeSnapshot();
      }
      onEdgesChangeBase(changes);
      if (mutated) {
        setIsDirty(true);
      }
    },
    [onEdgesChangeBase, takeSnapshot]
  );

  // Memoize graph conversions on a STRUCTURAL signature: live-stream status/
  // output updates and node drags replace node objects constantly, but the
  // type graph only changes when ids/ports/config/wiring do. Keeping the
  // arrays (and thus portTypeMap) referentially stable skips whole-graph
  // re-inference per event and stops every Port from re-rendering.
  const graphNodesRaw = useMemo(() => nodesToGraphNodes(nodes), [nodes]);
  const graphEdgesRaw = useMemo(() => edgesToGraphEdges(edges), [edges]);
  const graphNodes = useSignatureMemo(graphNodesRaw);
  const graphEdges = useSignatureMemo(graphEdgesRaw);

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
        portTypeMap.get(portKey(sourceNode.id, sourcePortId)) ?? parsePortType(sourcePort);
      const inputType =
        portTypeMap.get(portKey(targetNode.id, targetPortId)) ?? parsePortType(targetPort);

      return isCompatible(outputType, inputType);
    },
    [nodes, portTypeMap]
  );

  // Handle new connections. Ports are multi-connection: an output may fan out to
  // many targets and an input may fan in from many sources (the reactive flow
  // merges them). addEdge dedupes exact-duplicate wires; type compatibility is
  // still enforced at drag time by isValidConnection above.
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const newEdge = buildEdge(
        connection.source,
        connection.sourceHandle || 'out',
        connection.target,
        connection.targetHandle || 'in'
      );

      takeSnapshot();
      setEdges((eds) => addEdge(newEdge, eds));
      setIsDirty(true);
    },
    [setEdges, takeSnapshot]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: MouseEvent, node: Node) => {
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
      const newNode = buildBlockNode(blockType, position);
      takeSnapshot();
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newNode.id);
      setIsDirty(true);
      return newNode.id;
    },
    [setNodes, takeSnapshot]
  );

  // Add a block already wired to an existing port (the wire-drop picker).
  // One snapshot for the whole gesture, so undo removes node and edge together.
  const addConnectedBlock = useCallback(
    (
      blockType: BlockTypeInfo,
      position: { x: number; y: number },
      origin: ConnectionOrigin,
      portId: string
    ) => {
      const newNode = buildBlockNode(blockType, position);
      const newEdge =
        origin.handleType === 'source'
          ? buildEdge(origin.nodeId, origin.handleId, newNode.id, portId)
          : buildEdge(newNode.id, portId, origin.nodeId, origin.handleId);

      takeSnapshot();
      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => addEdge(newEdge, eds));
      setSelectedNodeId(newNode.id);
      setIsDirty(true);
      return newNode.id;
    },
    [setNodes, setEdges, takeSnapshot]
  );

  // Update block config (targeted — only creates new object for the changed node).
  // When the block has dynamic (templated) output ports, recompute them from the
  // merged config so adding/removing a case adds/removes its handle immediately.
  // Throttle config snapshots: typing in a field produces one undo step per
  // pause, not one per keystroke.
  const lastConfigSnapshotRef = useRef({ nodeId: '', at: 0 });

  const updateBlockConfig = useCallback(
    (nodeId: string, config: Partial<WorkflowBlock>) => {
      const now = Date.now();
      const last = lastConfigSnapshotRef.current;
      if (last.nodeId !== nodeId || now - last.at > 800) {
        takeSnapshot();
      }
      lastConfigSnapshotRef.current = { nodeId, at: now };
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
        const mergedConfig = { ...data.config, ...config };
        const def = blockSchemaMap[data.type];
        let outputs = data.outputs;
        if (def?.outputs?.some((p) => p.dynamic)) {
          const expanded = expandDynamicPorts(
            def.outputs.map((p) => ({
              id: p.id,
              name: p.name || p.id,
              type: p.type,
              dynamic: p.dynamic,
            })),
            mergedConfig
          );
          // Keep the existing array identity when nothing structural changed:
          // handle re-measurement and edge revalidation only run on real
          // port-set changes, not on every config keystroke.
          if (!data.outputs || !portsEqual(expanded, data.outputs)) {
            outputs = expanded;
          }
        }
        const updated = [...nds];
        updated[idx] = {
          ...node,
          data: { ...data, config: mergedConfig, outputs },
        };
        return updated;
      });
      setIsDirty(true);
    },
    [setNodes, blockSchemaMap, takeSnapshot]
  );

  // Keep edges valid as dynamic ports appear/disappear: drop any edge whose
  // source/target handle no longer exists on its node. Returns the same array
  // reference when nothing changed, so this never loops.
  useEffect(() => {
    setEdges((eds) => {
      const handlesByNode = new Map<string, Set<string>>();
      for (const n of nodes) {
        const d = n.data as BlockNodeData;
        handlesByNode.set(
          n.id,
          new Set([...(d.inputs ?? []).map((p) => p.id), ...(d.outputs ?? []).map((p) => p.id)])
        );
      }
      const valid = eds.filter((e) => {
        const srcHandles = handlesByNode.get(e.source);
        if (srcHandles && e.sourceHandle && !srcHandles.has(e.sourceHandle)) {
          return false;
        }
        const tgtHandles = handlesByNode.get(e.target);
        if (tgtHandles && e.targetHandle && !tgtHandles.has(e.targetHandle)) {
          return false;
        }
        return true;
      });
      return valid.length === eds.length ? eds : valid;
    });
  }, [nodes, setEdges]);

  // Set block status (for debugging)
  const setBlockStatus = useCallback(
    (blockId: string, status: BlockStatus, output?: unknown) => {
      if (output !== undefined) {
        setBlockOutputs((prev) => ({
          ...prev,
          [blockId]: output,
        }));
      }
      // Update node data: status always, plus the last output when this event
      // carried one, so every block shows its most recent value on the canvas
      // (via ExecutionResult) and not just blocks that ship a custom node view.
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === blockId && node.type === 'block') {
            return {
              ...node,
              data:
                output === undefined ? { ...node.data, status } : { ...node.data, status, output },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Record the latest value seen on an output port (for previews and the
  // editor-side template scope of downstream blocks).
  const setPortValue = useCallback((blockId: string, port: string, value: unknown) => {
    setPortValues((prev) => {
      const key = `${blockId}:${port}`;
      if (Object.is(prev[key], value)) {
        return prev;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  // Push the latest emitted value into a block's node data so node-body views
  // (useBlockData) render live. Scoped to blocks that actually ship a node view,
  // so high-frequency workflows don't re-render the whole graph.
  const setBlockLiveOutput = useCallback(
    (blockId: string, output: unknown) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== blockId || node.type !== 'block') {
            return node;
          }
          const data = node.data as BlockNodeData;
          if (!data.nodeModuleUrl || Object.is(data.output, output)) {
            return node;
          }
          return { ...node, data: { ...data, output } };
        })
      );
    },
    [setNodes]
  );

  const getAvailableVariables = useCallback(
    (blockId: string) => {
      const blockNodes = nodes.filter((n) => n.type === 'block');
      const targetNode = blockNodes.find((n) => n.id === blockId);
      const incomingEdges = edges.filter((e) => e.target === blockId);

      const inputVars = incomingEdges.flatMap((edge) =>
        collectInputVariables(edge, blockNodes, portTypeMap, blockOutputs)
      );
      const configVars = targetNode ? collectConfigVariables(targetNode.data as BlockNodeData) : [];

      return [...inputVars, ...configVars];
    },
    [nodes, edges, portTypeMap, blockOutputs]
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
    addConnectedBlock,
    updateBlockConfig,
    undo,
    redo,
    canUndo,
    canRedo,
    setSelectedNodeId,
    blockOutputs,
    portValues,
    setPortValue,
    setBlockStatus,
    setBlockLiveOutput,
    getAvailableVariables,
    portTypeMap,
    blockSchemaMap,
  };
}
