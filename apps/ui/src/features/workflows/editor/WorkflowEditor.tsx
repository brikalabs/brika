import { useQuery } from '@tanstack/react-query';
import {
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
  type NodeTypes,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useLocale } from '@/lib/use-locale';
import '@xyflow/react/dist/style.css';

import { Loader2, Save } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { Workflow } from '../api';
import { BlockNode, type BlockNodeData } from './BlockNode';
import { type BlockDefinition, BlockToolbar, type BlockTypeInfo } from './BlockToolbar';
import { ConfigPanel } from './ConfigPanel';
import { DebugPanel } from './DebugPanel';
import { useWorkflowEditor } from './useWorkflowEditor';

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
}

function WorkflowEditorInner({
  workflow: initialWorkflow,
  readonly = false,
  onSave,
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
  onSave,
}: WorkflowEditorWithBlocksProps) {
  const { t } = useLocale();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Pass block definitions to editor for proper type restoration
  const editor = useWorkflowEditor(initialWorkflow, blockDefinitions);

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
    isDirty,
    addBlock,
    updateBlockConfig,
    getAvailableVariables,
  } = editor;

  // Handle drop from toolbar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const data = event.dataTransfer.getData('application/reactflow');

      if (!data || !reactFlowBounds) return;

      const blockDef: BlockDefinition = JSON.parse(data);
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      };

      // Convert BlockDefinition to BlockTypeInfo for addBlock
      const blockType: BlockTypeInfo = {
        ...blockDef,
        type: blockDef.type || blockDef.id,
        category: blockDef.category as 'flow' | 'action' | 'data' | 'debug',
        defaultConfig: {},
      };

      addBlock(blockType, position);
    },
    [addBlock]
  );

  // Handle save
  const handleSave = async () => {
    if (onSave) {
      await onSave(workflow);
    }
  };

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
      <div className="flex flex-1 flex-col" ref={reactFlowWrapper}>
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

          {/* Top toolbar */}
          {!readonly && (
            <Panel position="top-right" className="flex items-center gap-2">
              {isDirty && (
                <Badge variant="secondary" className="text-xs">
                  {t('workflows:editor.unsavedChanges')}
                </Badge>
              )}
              <Button size="sm" variant="default" onClick={handleSave} disabled={!isDirty}>
                <Save className="mr-1 size-4" />
                {t('common:actions.save')}
              </Button>
            </Panel>
          )}
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
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
