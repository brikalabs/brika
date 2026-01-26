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
import { Blocks, GripVertical, Loader2, MousePointerClick, Settings2, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import '@xyflow/react/dist/style.css';
import type { Workflow } from '../api';
import { useDebugStream } from '../debug';
import { BlockNode, type BlockNodeData } from './BlockNode';
import { type BlockDefinition, BlockToolbar, type BlockTypeInfo } from './BlockToolbar';
import { CollapsedTab, CollapsedTabsContainer, CollapsiblePanel } from './CollapsiblePanel';
import { ConfigPanel } from './ConfigPanel';
import { DebugPanel } from './DebugPanel';
import { useWorkflowEditor } from './useWorkflowEditor';

// ─────────────────────────────────────────────────────────────────────────────
// Spark Schema Interface
// ─────────────────────────────────────────────────────────────────────────────

interface RegisteredSpark {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

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
}: Readonly<WorkflowEditorInnerProps>) {
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
}: Readonly<WorkflowEditorWithBlocksProps>) {
  const { t } = useLocale();
  const { screenToFlowPosition } = useReactFlow();

  // Panel collapse state (persisted to localStorage)
  const [panelStates, setPanelStates] = useState(() => {
    try {
      const saved = localStorage.getItem('workflow-editor-panels');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore localStorage errors
    }
    return { blocks: true, config: true, debug: true };
  });

  const togglePanel = useCallback((panel: 'blocks' | 'config' | 'debug') => {
    setPanelStates((prev: Record<string, boolean>) => {
      const next = { ...prev, [panel]: !prev[panel] };
      localStorage.setItem('workflow-editor-panels', JSON.stringify(next));
      return next;
    });
  }, []);

  // Fetch sparks for type resolution
  const { data: sparks = [] } = useQuery({
    queryKey: ['sparks'],
    queryFn: () => fetcher<RegisteredSpark[]>('/api/sparks'),
    staleTime: 30000,
  });

  // Create type lookup function for resolvers
  const typeLookup = useCallback(
    <T,>(key: string): T | undefined => {
      if (key === 'sparks') return sparks as T;
      return undefined;
    },
    [sparks]
  );

  // Pass block definitions and type lookup to editor
  const editor = useWorkflowEditor(initialWorkflow, blockDefinitions, onChange, { typeLookup });

  // Create a map of block type -> definition for quick lookup
  const blockSchemaMap = useMemo(() => {
    const map: Record<string, BlockDefinition> = {};
    for (const def of blockDefinitions) {
      map[def.type || def.id] = def;
    }
    return map;
  }, [blockDefinitions]);

  const {
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

  // Check which panels are collapsed for stacking
  const leftCollapsed = !readonly && !panelStates.blocks;
  const configCollapsed = !readonly && selectedNode && !panelStates.config;
  const debugCollapsed = !readonly && !panelStates.debug;

  return (
    <div className="flex h-full">
      {/* Block Toolbar (expanded) */}
      {!readonly && (
        <CollapsiblePanel
          side="left"
          icon={<Blocks className="size-4" />}
          title={t('workflows:editor.panels.blocks')}
          isOpen={panelStates.blocks}
          onToggle={() => togglePanel('blocks')}
          width="w-56"
        >
          <BlockToolbar className="h-full w-full" onCollapse={() => togglePanel('blocks')} />
        </CollapsiblePanel>
      )}

      {/* Canvas */}
      <div className="relative flex flex-1 flex-col">
        {/* Left collapsed tabs - absolute positioned */}
        {leftCollapsed && (
          <CollapsedTabsContainer side="left">
            <CollapsedTab
              side="left"
              icon={<Blocks className="size-4" />}
              title={t('workflows:editor.panels.blocks')}
              onExpand={() => togglePanel('blocks')}
            />
          </CollapsedTabsContainer>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={readonly ? undefined : onNodesChange}
          onEdgesChange={readonly ? undefined : onEdgesChange}
          onConnect={readonly ? undefined : onConnect}
          isValidConnection={isValidConnection}
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

        {/* Empty state overlay */}
        {nodes.length === 0 && !readonly && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-muted-foreground/30 border-dashed bg-background/80 p-8 text-center backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                  <GripVertical className="size-6 text-primary" />
                </div>
                <MousePointerClick className="size-5 text-muted-foreground" />
                <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                  <Blocks className="size-6 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="font-medium">{t('workflows:editor.panels.dragToAdd')}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('workflows:editor.panels.blocksDescription')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Right collapsed tabs - absolute positioned */}
        {(configCollapsed || debugCollapsed) && (
          <CollapsedTabsContainer side="right">
            {configCollapsed && (
              <CollapsedTab
                side="right"
                icon={<Settings2 className="size-4" />}
                title={t('workflows:editor.panels.config')}
                onExpand={() => togglePanel('config')}
              />
            )}
            {debugCollapsed && (
              <CollapsedTab
                side="right"
                icon={<Zap className="size-4 text-yellow-500" />}
                title={t('workflows:editor.panels.debug')}
                onExpand={() => togglePanel('debug')}
              />
            )}
          </CollapsedTabsContainer>
        )}
      </div>

      {/* Config Panel (expanded) */}
      {!readonly && selectedNode && (
        <CollapsiblePanel
          side="right"
          icon={<Settings2 className="size-4" />}
          title={t('workflows:editor.panels.config')}
          isOpen={panelStates.config}
          onToggle={() => togglePanel('config')}
          width="w-80"
        >
          <ConfigPanel
            node={selectedNode}
            onUpdateBlock={updateBlockConfig}
            availableVariables={availableVariables}
            blockSchema={selectedBlockSchema}
            className="h-full w-full"
            onCollapse={() => togglePanel('config')}
          />
        </CollapsiblePanel>
      )}

      {/* Debug Panel (expanded) */}
      {!readonly && (
        <CollapsiblePanel
          side="right"
          icon={<Zap className="size-4 text-yellow-500" />}
          title={t('workflows:editor.panels.debug')}
          isOpen={panelStates.debug}
          onToggle={() => togglePanel('debug')}
          width="w-72"
        >
          <DebugPanel
            workflow={workflow}
            className="h-full w-full"
            onCollapse={() => togglePanel('debug')}
          />
        </CollapsiblePanel>
      )}
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

export function WorkflowEditor(props: Readonly<WorkflowEditorProps>) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
