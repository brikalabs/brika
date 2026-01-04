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
import { useCallback, useMemo, useState } from 'react';
import type { Workflow, WorkflowBlock } from '../api';
import type { BlockNodeData } from './BlockNode';
import type { BlockTypeInfo } from './BlockToolbar';
import type { TriggerNodeData } from './TriggerNode';

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
function workflowToFlow(workflow: Workflow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Add trigger node
  nodes.push({
    id: 'trigger',
    type: 'trigger',
    position: { x: 300, y: 50 },
    data: {
      event: workflow.trigger.event,
      filter: workflow.trigger.filter,
    } as TriggerNodeData,
  });

  // Add block nodes
  const blocks = workflow.blocks || [];

  blocks.forEach((block, index) => {
    const isFirst = index === 0;
    const isLast =
      block.type === 'end' ||
      (!block.next && block.type !== 'condition' && block.type !== 'switch');

    nodes.push({
      id: block.id,
      type: 'block',
      position: { x: 300, y: 180 + index * 140 },
      data: {
        id: block.id,
        type: block.type,
        label: block.id,
        config: block,
        isFirst,
        isLast,
        status: 'idle',
      } as BlockNodeData,
    });
  });

  // Connect trigger to first block
  if (blocks.length > 0) {
    edges.push({
      id: 'trigger-to-first',
      source: 'trigger',
      target: blocks[0].id,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: true,
    });
  }

  // Create edges based on block connections
  blocks.forEach((block) => {
    if (block.next) {
      edges.push({
        id: `${block.id}-to-${block.next}`,
        source: block.id,
        target: block.next as string,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }

    if (block.type === 'condition') {
      if (block.then) {
        edges.push({
          id: `${block.id}-then-${block.then}`,
          source: block.id,
          target: block.then as string,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: 'then',
          style: { stroke: '#22c55e' },
        });
      }
      if (block.else) {
        edges.push({
          id: `${block.id}-else-${block.else}`,
          source: block.id,
          target: block.else as string,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: 'else',
          style: { stroke: '#ef4444' },
        });
      }
    }

    if (block.type === 'switch' && block.cases) {
      const cases = block.cases as Record<string, string>;
      Object.entries(cases).forEach(([value, target]) => {
        edges.push({
          id: `${block.id}-case-${value}`,
          source: block.id,
          target,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: value,
        });
      });
      if (block.default) {
        edges.push({
          id: `${block.id}-default`,
          source: block.id,
          target: block.default as string,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          label: 'default',
          style: { stroke: '#6b7280' },
        });
      }
    }
  });

  return { nodes, edges };
}

// Convert React Flow nodes/edges back to workflow
function flowToWorkflow(nodes: Node[], edges: Edge[], originalWorkflow: Workflow): Workflow {
  const triggerNode = nodes.find((n) => n.type === 'trigger');
  const blockNodes = nodes.filter((n) => n.type === 'block');

  // Build blocks from nodes
  const blocks: WorkflowBlock[] = blockNodes.map((node) => {
    const data = node.data as BlockNodeData;
    const block: WorkflowBlock = {
      ...data.config,
      id: node.id,
      type: data.type,
    };

    // Find outgoing edges and set next/then/else
    const outEdges = edges.filter((e) => e.source === node.id);

    if (data.type === 'condition') {
      const thenEdge = outEdges.find((e) => e.label === 'then');
      const elseEdge = outEdges.find((e) => e.label === 'else');
      if (thenEdge) block.then = thenEdge.target;
      if (elseEdge) block.else = elseEdge.target;
    } else if (data.type === 'switch') {
      const cases: Record<string, string> = {};
      outEdges.forEach((e) => {
        if (e.label === 'default') {
          block.default = e.target;
        } else if (e.label) {
          cases[e.label as string] = e.target;
        }
      });
      block.cases = cases;
    } else {
      const nextEdge = outEdges[0];
      if (nextEdge) block.next = nextEdge.target;
    }

    return block;
  });

  // Sort blocks by Y position for consistent ordering
  blocks.sort((a, b) => {
    const nodeA = blockNodes.find((n) => n.id === a.id);
    const nodeB = blockNodes.find((n) => n.id === b.id);
    return (nodeA?.position.y || 0) - (nodeB?.position.y || 0);
  });

  return {
    ...originalWorkflow,
    trigger: {
      event: (triggerNode?.data as TriggerNodeData)?.event || '*',
      filter: (triggerNode?.data as TriggerNodeData)?.filter,
    },
    blocks,
  };
}

let nodeIdCounter = 0;

function generateNodeId(type: string): string {
  nodeIdCounter++;
  return `${type}-${Date.now().toString(36)}-${nodeIdCounter}`;
}

export function useWorkflowEditor(initialWorkflow: Workflow) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => workflowToFlow(initialWorkflow),
    [initialWorkflow]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, BlockStatus>>({});
  const [blockOutputs, setBlockOutputs] = useState<Record<string, unknown>>({});
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

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

  // Update trigger config
  const updateTriggerConfig = useCallback(
    (config: { event?: string; filter?: Record<string, unknown> }) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === 'trigger') {
            const data = node.data as TriggerNodeData;
            return {
              ...node,
              data: { ...data, ...config },
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
  const getAvailableVariables = useCallback(
    (blockId: string) => {
      const variables: { name: string; source: string; type: string }[] = [
        { name: 'trigger.type', source: 'trigger', type: 'string' },
        { name: 'trigger.payload', source: 'trigger', type: 'object' },
        { name: 'trigger.source', source: 'trigger', type: 'string' },
        { name: 'trigger.ts', source: 'trigger', type: 'number' },
        { name: 'prev', source: 'previous block', type: 'any' },
      ];

      // Find set blocks that come before this block
      const blockNodes = nodes.filter((n) => n.type === 'block');
      const blockIndex = blockNodes.findIndex((n) => n.id === blockId);

      blockNodes.slice(0, blockIndex).forEach((node) => {
        const data = node.data as BlockNodeData;
        if (data.type === 'set' && data.config.var) {
          variables.push({
            name: `vars.${data.config.var}`,
            source: `set block "${node.id}"`,
            type: 'any',
          });
        }
      });

      return variables;
    },
    [nodes]
  );

  return {
    // React Flow state
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onPaneClick,
    onNodesDelete,
    onEdgesDelete,

    // Editor state
    workflow,
    selectedNodeId,
    selectedNode,
    isDirty,

    // Actions
    addBlock,
    updateBlockConfig,
    updateTriggerConfig,
    setSelectedNodeId,

    // Execution state
    blockStatuses,
    blockOutputs,
    executionLogs,
    setBlockStatus,
    addExecutionLog,
    clearExecutionState,

    // Helpers
    getAvailableVariables,
  };
}
