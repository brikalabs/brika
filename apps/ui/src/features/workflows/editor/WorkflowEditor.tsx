import { useQuery } from '@tanstack/react-query';
import {
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocale } from '@/lib/use-locale';
import '@xyflow/react/dist/style.css';
import type { Workflow } from '../api';
import { useDebugStream } from '../debug';
import { BlockNode, type BlockNodeData } from './BlockNode';
import { type BlockDefinition, BlockToolbar, type BlockTypeInfo } from './BlockToolbar';
import { ConfigPanel } from './ConfigPanel';
import { DebugPanel } from './DebugPanel';
import { useWorkflowEditor } from './useWorkflowEditor';

// Simple ping animation using DOM manipulation
function pingHandle(blockId: string, portId: string) {
  const selector = `.react-flow__node[data-id="${blockId}"] .react-flow__handle[data-handleid="${portId}"]`;
  const handle = document.querySelector(selector) as HTMLElement | null;

  if (handle) {
    // Remove class first to allow re-triggering
    handle.classList.remove('handle-ping');
    // Force reflow to restart animation
    void handle.offsetWidth;
    handle.classList.add('handle-ping');
    // Remove after animation completes (1s)
    setTimeout(() => handle.classList.remove('handle-ping'), 1000);
  }
}

// Fetch all block definitions with schemas
async function fetchBlockDefinitions(): Promise<BlockDefinition[]> {
  const res = await fetch('/api/blocks');
  if (!res.ok) return [];
  return res.json();
}

// Node types for React Flow
const nodeTypes: NodeTypes = {
  block: BlockNode,
};

interface WorkflowEditorInnerProps {
  workflow: Workflow;
  readonly?: boolean;
  onSave?: (workflow: Workflow) => Promise<void>;
  onChange?: (workflow: Workflow, isDirty: boolean) => void;
}

function WorkflowEditorInner({
  workflow: initialWorkflow,
  readonly = false,
  onSave,
  onChange,
}: WorkflowEditorInnerProps) {
  const { t } = useLocale();

  // Fetch block definitions for schemas - must load before editor initializes
  const { data: blockDefinitions, isLoading: isLoadingBlocks } = useQuery({
    queryKey: ['blocks'],
    queryFn: fetchBlockDefinitions,
    staleTime: 60000,
  });

  // Show loading state while block definitions are being fetched
  if (isLoadingBlocks || !blockDefinitions) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">{t('common:loading')}</p>
        </div>
      </div>
    );
  }

  // Now we can safely initialize the editor with block definitions
  return (
    <WorkflowEditorWithBlocks
      workflow={initialWorkflow}
      blockDefinitions={blockDefinitions}
      readonly={readonly}
      onSave={onSave}
      onChange={onChange}
    />
  );
}

interface WorkflowEditorWithBlocksProps extends WorkflowEditorInnerProps {
  blockDefinitions: BlockDefinition[];
}

function WorkflowEditorWithBlocks({
  workflow: initialWorkflow,
  blockDefinitions,
  readonly = false,
  onChange,
}: WorkflowEditorWithBlocksProps) {
  const { screenToFlowPosition } = useReactFlow();

  // Pass block definitions to editor for proper type restoration
  const editor = useWorkflowEditor(initialWorkflow, blockDefinitions, onChange);

  // Create a map of block type -> definition for quick lookup
  const blockSchemaMap = useMemo(() => {
    const map: Record<string, BlockDefinition> = {};
    for (const def of blockDefinitions) {
      map[def.type || def.id] = def;
      // Also map by just the ID part for legacy blocks
      const idPart = (def.type || def.id).split(':').pop();
      if (idPart) map[idPart] = def;
    }
    return map;
  }, [blockDefinitions]);

  const {
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
    selectedNode,
    addBlock,
    updateBlockConfig,
    getAvailableVariables,
  } = editor;

  // Connect to debug stream for port ping animations
  const { events } = useDebugStream({
    workflowId: workflow.id,
    maxEvents: 50,
  });

  // Track last processed event timestamp to handle array truncation
  const lastProcessedTimestamp = useRef(0);

  // Trigger port pings when emit events come in
  useEffect(() => {
    // Find events newer than the last processed timestamp
    const newEvents = events.filter((e) => e.timestamp > lastProcessedTimestamp.current);

    if (newEvents.length > 0) {
      // Update to the latest timestamp
      lastProcessedTimestamp.current = Math.max(...newEvents.map((e) => e.timestamp));
    }

    for (const event of newEvents) {
      if (event.type === 'block.emit' && event.blockId && event.port) {
        // Ping output port
        pingHandle(event.blockId, event.port);

        // Ping connected input ports
        for (const edge of edges) {
          if (edge.source === event.blockId && edge.sourceHandle === event.port) {
            pingHandle(edge.target, edge.targetHandle || 'in');
          }
        }
      }
    }
  }, [events, edges]);

  // Handle drop from toolbar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

      const blockDef: BlockDefinition = JSON.parse(data);

      // Use screenToFlowPosition to correctly handle zoom and pan
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Offset to center the block on the cursor
      position.x -= 100;
      position.y -= 30;

      // Convert BlockDefinition to BlockTypeInfo for addBlock
      const blockType: BlockTypeInfo = {
        ...blockDef,
        type: blockDef.type || blockDef.id,
        category: blockDef.category as 'flow' | 'action' | 'data' | 'debug',
        defaultConfig: {},
      };

      addBlock(blockType, position);
    },
    [addBlock, screenToFlowPosition]
  );

  // Get available variables for selected block
  const availableVariables = selectedNode ? getAvailableVariables(selectedNode.id) : [];

  // Get block schema for selected node
  const selectedBlockSchema = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'block') return undefined;
    const blockData = selectedNode.data as unknown as BlockNodeData;
    const blockType = blockData.type || '';
    return blockSchemaMap[blockType]?.schema;
  }, [selectedNode, blockSchemaMap]);

  return (
    <div className="flex h-full">
      {/* Block Toolbar */}
      {!readonly && <BlockToolbar className="w-56 shrink-0" />}

      {/* Canvas */}
      <div className="flex flex-1 flex-col">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readonly ? undefined : onNodesChange}
          onEdgesChange={readonly ? undefined : onEdgesChange}
          onConnect={readonly ? undefined : onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodesDelete={readonly ? undefined : onNodesDelete}
          onEdgesDelete={readonly ? undefined : onEdgesDelete}
          onDragOver={readonly ? undefined : onDragOver}
          onDrop={readonly ? undefined : onDrop}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={!readonly}
          nodesConnectable={!readonly}
          elementsSelectable={true}
          deleteKeyCode={readonly ? null : 'Backspace'}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={!readonly} />
          <MiniMap
            nodeColor={(node) => {
              const blockData = node.data as BlockNodeData;
              return blockData?.color || '#6b7280';
            }}
            className="!bg-muted"
          />
        </ReactFlow>
      </div>

      {/* Config Panel */}
      {!readonly && selectedNode && (
        <ConfigPanel
          node={selectedNode}
          onUpdateBlock={updateBlockConfig}
          availableVariables={availableVariables}
          blockSchema={selectedBlockSchema}
          className="w-80 shrink-0"
        />
      )}

      {/* Debug Panel */}
      {!readonly && <DebugPanel workflow={workflow} className="w-72 shrink-0" />}
    </div>
  );
}

// Wrapper with ReactFlowProvider
export interface WorkflowEditorProps {
  workflow: Workflow;
  readonly?: boolean;
  onSave?: (workflow: Workflow) => Promise<void>;
  onChange?: (workflow: Workflow, isDirty: boolean) => void;
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
