import { toast } from '@brika/clay';
import { portKey } from '@brika/type-system';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  ConnectionLineType,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnectEnd,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import '@xyflow/react/dist/style.css';
import { fetchWorkflowPortValues, type Workflow } from '../api';
import { useDebugStream } from '../debug';
import { BlockNode } from './BlockNode';
import { type BlockDefinition, type BlockTypeInfo } from './BlockToolbar';
import {
  BlockInputValuesContext,
  collectInputValues,
  WorkflowIdContext,
} from './block-input-values';
import { ConfigPanel } from './ConfigPanel';
import { ConnectionDropPicker } from './ConnectionDropPicker';
import {
  type CompatibleBlock,
  compatibleBlocksForSource,
  compatibleBlocksForTarget,
  connectionOriginOf,
  eventClientPoint,
  typeLabel,
} from './connection-compat';
import { DiagnosticsBadge } from './DiagnosticsBadge';
import {
  BlocksPanel,
  EmptyStateOverlay,
  InspectorPanel,
  LeftCollapsedTabs,
  RightCollapsedTabs,
} from './EditorChrome';
import { EditorCommandPalette } from './EditorCommandPalette';
import { EditorControls } from './EditorControls';
import { collectDiagnostics, type GraphDiagnostic, invalidEdgeIds } from './graph-diagnostics';
import { processNewEvents } from './live-events';
import { type PanelName, usePanelState } from './use-panel-state';
import { type ConnectionOrigin, useWorkflowEditor } from './useWorkflowEditor';
import { WorkflowTypeContext } from './WorkflowTypeContext';

export interface RegisteredSpark {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

/** Extract BlockNodeData.type from a selected node */
function getBlockType(node: Node): string {
  const data: Record<string, unknown> = node.data;
  if (typeof data?.type === 'string') {
    return data.type;
  }
  return '';
}

// Fetch all block definitions with schemas
async function fetchBlockDefinitions(): Promise<BlockDefinition[]> {
  const res = await fetch('/api/blocks');
  if (!res.ok) {
    return [];
  }
  return res.json();
}

// Node types for React Flow
const nodeTypes: NodeTypes = {
  block: BlockNode,
};

interface EditorCanvasProps {
  readonly: boolean;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: ReturnType<typeof useWorkflowEditor>['onNodesChange'];
  onEdgesChange: ReturnType<typeof useWorkflowEditor>['onEdgesChange'];
  onConnect: ReturnType<typeof useWorkflowEditor>['onConnect'];
  onConnectEnd: OnConnectEnd | undefined;
  isValidConnection: ReturnType<typeof useWorkflowEditor>['isValidConnection'];
  onNodeClick: ReturnType<typeof useWorkflowEditor>['onNodeClick'];
  onPaneClick: ReturnType<typeof useWorkflowEditor>['onPaneClick'];
  onNodesDelete: ReturnType<typeof useWorkflowEditor>['onNodesDelete'];
  onEdgesDelete: ReturnType<typeof useWorkflowEditor>['onEdgesDelete'];
  onDragOver: ((event: React.DragEvent) => void) | undefined;
  onDrop: ((event: React.DragEvent) => void) | undefined;
  leftCollapsed: boolean;
  inspectorCollapsed: boolean;
  hasSelection: boolean;
  togglePanel: (panel: PanelName) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  diagnostics: ReadonlyArray<GraphDiagnostic>;
  onJumpToNode: (nodeId: string) => void;
}

function EditorCanvas({
  readonly,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onConnectEnd,
  isValidConnection,
  onNodeClick,
  onPaneClick,
  onNodesDelete,
  onEdgesDelete,
  onDragOver,
  onDrop,
  leftCollapsed,
  inspectorCollapsed,
  hasSelection,
  togglePanel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  diagnostics,
  onJumpToNode,
}: Readonly<EditorCanvasProps>) {
  return (
    <div className="relative flex flex-1 flex-col">
      {leftCollapsed && <LeftCollapsedTabs togglePanel={togglePanel} />}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readonly ? undefined : onNodesChange}
        onEdgesChange={readonly ? undefined : onEdgesChange}
        onConnect={readonly ? undefined : onConnect}
        onConnectEnd={readonly ? undefined : onConnectEnd}
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
        fitViewOptions={{
          padding: 0.2,
        }}
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        elementsSelectable={true}
        deleteKeyCode={readonly ? null : 'Backspace'}
        proOptions={{
          hideAttribution: true,
        }}
      >
        <Background />
        <EditorControls
          showInteractive={!readonly}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
        {!readonly && <DiagnosticsBadge diagnostics={diagnostics} onJump={onJumpToNode} />}
      </ReactFlow>

      {nodes.length === 0 && !readonly && <EmptyStateOverlay />}

      {inspectorCollapsed && (
        <RightCollapsedTabs hasSelection={hasSelection} togglePanel={togglePanel} />
      )}
    </div>
  );
}

interface WorkflowEditorInnerProps {
  workflow: Workflow;
  readonly?: boolean;
  onChange?: (workflow: Workflow, isDirty: boolean) => void;
}

function WorkflowEditorInner({
  workflow: initialWorkflow,
  readonly = false,
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
      onChange={onChange}
    />
  );
}

interface WorkflowEditorWithBlocksProps extends WorkflowEditorInnerProps {
  blockDefinitions: BlockDefinition[];
}

/** A wire dropped on empty canvas: where, and from which handle. */
interface DropPickerState {
  screen: { x: number; y: number };
  nodePosition: { x: number; y: number };
  origin: ConnectionOrigin;
}

function WorkflowEditorWithBlocks({
  workflow: initialWorkflow,
  blockDefinitions,
  readonly = false,
  onChange,
}: Readonly<WorkflowEditorWithBlocksProps>) {
  const { t } = useLocale();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { panelStates, togglePanel, openPanel } = usePanelState();
  const capture = useCapture();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dropPicker, setDropPicker] = useState<DropPickerState | null>(null);

  // Fetch sparks for type resolution
  const { data: sparks = [] } = useQuery({
    queryKey: ['sparks'],
    queryFn: () => fetcher<RegisteredSpark[]>('/api/sparks'),
    staleTime: 30000,
  });

  // Stable type lookup — ref keeps identity stable across spark refetches
  const sparksRef = useRef(sparks);
  sparksRef.current = sparks;
  const typeLookup = useCallback(<T,>(key: string): T | undefined => {
    if (key === 'sparks') {
      return sparksRef.current as T;
    }
    return undefined;
  }, []);

  // Pass block definitions and type lookup to editor
  const editor = useWorkflowEditor(initialWorkflow, blockDefinitions, onChange, {
    typeLookup,
  });

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
    addConnectedBlock,
    updateBlockConfig,
    getAvailableVariables,
    portTypeMap,
    blockSchemaMap,
    blockOutputs,
    portValues,
    setPortValue,
    setBlockLiveOutput,
    setBlockStatus,
    setSelectedNodeId,
    undo,
    redo,
    canUndo,
    canRedo,
  } = editor;

  // Connect to debug stream for port ping animations
  const { events } = useDebugStream({
    workflowId: workflow.id,
    maxEvents: 50,
  });

  // Track last processed event timestamp to handle array truncation
  const lastProcessedTimestamp = useRef(0);

  // Trigger port pings, live node-view updates, and status rings on new events
  useEffect(() => {
    processNewEvents(
      events,
      edges,
      lastProcessedTimestamp,
      setBlockLiveOutput,
      setBlockStatus,
      setPortValue
    );
  }, [events, edges, setBlockLiveOutput, setBlockStatus, setPortValue]);

  // Seed last-seen port values from the hub once per workflow, so previews
  // and node views (Image, ...) keep their last data across editor reloads.
  const seededWorkflowRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededWorkflowRef.current === workflow.id) {
      return;
    }
    seededWorkflowRef.current = workflow.id;
    let cancelled = false;
    fetchWorkflowPortValues(workflow.id).then((values) => {
      if (cancelled) {
        return;
      }
      for (const entry of values) {
        setPortValue(entry.blockId, entry.port, entry.value);
        setBlockLiveOutput(entry.blockId, entry.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workflow.id, setPortValue, setBlockLiveOutput]);

  // Live input values per node (edge wiring x last emitted port values), the
  // editor-side scope for resolving {{ }} in node-body views.
  const inputValuesByNode = useMemo(
    () => collectInputValues(edges, portValues, blockOutputs),
    [edges, portValues, blockOutputs]
  );

  // Static graph analysis: stale type mismatches, missing required config,
  // missing block types, feedback loops. Edges with a type mismatch render in
  // the destructive color so the broken wire is visible on the canvas itself.
  const diagnostics = useMemo(
    () => collectDiagnostics({ nodes, edges, portTypeMap, blockSchemaMap }),
    [nodes, edges, portTypeMap, blockSchemaMap]
  );
  const displayEdges = useMemo(() => {
    const invalid = invalidEdgeIds(diagnostics);
    if (invalid.size === 0) {
      return edges;
    }
    return edges.map((edge) =>
      invalid.has(edge.id)
        ? { ...edge, style: { ...edge.style, stroke: 'var(--destructive)', strokeWidth: 2 } }
        : edge
    );
  }, [edges, diagnostics]);

  // Handle drop from toolbar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) {
        return;
      }

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
        defaultConfig: {},
      };

      capture('workflow.block_added', {
        blockType: blockType.type,
        pluginId: blockDef.pluginId,
      });
      addBlock(blockType, position);
    },
    [addBlock, screenToFlowPosition, capture]
  );

  // Wire dropped on an incompatible handle: explain why instead of failing
  // silently. Wire dropped on empty canvas: open the compatible-block picker.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.isValid) {
        return;
      }
      const origin = connectionOriginOf(connectionState);
      if (!origin) {
        return;
      }

      const { toNode, toHandle } = connectionState;
      if (toNode && toHandle) {
        if (toNode.id === origin.nodeId) {
          toast.error(t('workflows:editor.connection.selfConnection'));
          return;
        }
        const fromIsSource = origin.handleType === 'source';
        const outKey = fromIsSource
          ? portKey(origin.nodeId, origin.handleId)
          : portKey(toNode.id, toHandle.id ?? 'out');
        const inKey = fromIsSource
          ? portKey(toNode.id, toHandle.id ?? 'in')
          : portKey(origin.nodeId, origin.handleId);
        capture('workflow.connection_rejected', { reason: 'incompatible-types' });
        toast.error(
          t('workflows:editor.connection.incompatible', {
            output: typeLabel(portTypeMap.get(outKey), 'generic'),
            input: typeLabel(portTypeMap.get(inKey), 'generic'),
          })
        );
        return;
      }

      const screen = eventClientPoint(event);
      const flowPoint = screenToFlowPosition(screen);
      const nodePosition =
        origin.handleType === 'source'
          ? { x: flowPoint.x - 128, y: flowPoint.y + 8 }
          : { x: flowPoint.x - 128, y: flowPoint.y - 160 };
      capture('workflow.wire_drop_picker_opened', { from: origin.handleType });
      setDropPicker({ screen, nodePosition, origin });
    },
    [t, capture, portTypeMap, screenToFlowPosition]
  );

  // Blocks with at least one port compatible with the dragged handle.
  const dropCandidates = useMemo<CompatibleBlock[]>(() => {
    if (!dropPicker) {
      return [];
    }
    const { origin } = dropPicker;
    const originType = portTypeMap.get(portKey(origin.nodeId, origin.handleId));
    return origin.handleType === 'source'
      ? compatibleBlocksForSource(blockDefinitions, originType)
      : compatibleBlocksForTarget(blockDefinitions, originType);
  }, [dropPicker, portTypeMap, blockDefinitions]);

  const handleDropPick = useCallback(
    (candidate: CompatibleBlock, translatedLabel: string) => {
      if (!dropPicker) {
        return;
      }
      const blockType: BlockTypeInfo = {
        ...candidate.block,
        type: candidate.block.type || candidate.block.id,
        defaultConfig: {},
        translatedLabel,
      };
      capture('workflow.block_added', {
        blockType: blockType.type,
        pluginId: candidate.block.pluginId,
        via: 'wire-drop',
      });
      addConnectedBlock(blockType, dropPicker.nodePosition, dropPicker.origin, candidate.portId);
      setDropPicker(null);
    },
    [dropPicker, addConnectedBlock, capture]
  );

  // Command palette: insert at the visible canvas center, jump, undo/redo.
  const handlePaletteAdd = useCallback(
    (block: BlockDefinition, translatedLabel: string) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      capture('workflow.block_added', {
        blockType: block.type || block.id,
        pluginId: block.pluginId,
        via: 'palette',
      });
      addBlock(
        {
          ...block,
          type: block.type || block.id,
          defaultConfig: {},
          translatedLabel,
        },
        { x: center.x - 128, y: center.y - 60 }
      );
    },
    [addBlock, screenToFlowPosition, capture]
  );

  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1.25 });
    },
    [setSelectedNodeId, fitView]
  );

  // Keyboard shortcuts: Cmd+K palette, Cmd+Z / Shift+Cmd+Z history.
  useEffect(() => {
    if (readonly) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const el = e.target instanceof HTMLElement ? e.target : null;
      const editable =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editable) {
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readonly, undo, redo]);

  // Get available variables for selected block
  const availableVariables = selectedNode ? getAvailableVariables(selectedNode.id) : [];

  // Get the full block definition for the selected node (schema + custom view).
  const selectedBlockDef = useMemo(() => {
    if (selectedNode?.type !== 'block') {
      return undefined;
    }
    return blockSchemaMap[getBlockType(selectedNode)];
  }, [selectedNode, blockSchemaMap]);

  // Selecting a block focuses the inspector on it (opening the panel if the
  // user had collapsed it earlier).
  useEffect(() => {
    if (selectedNode) {
      openPanel('inspector');
    }
  }, [selectedNode, openPanel]);

  const leftCollapsed = !readonly && !panelStates.blocks;
  const inspectorCollapsed = !readonly && !panelStates.inspector;

  return (
    <WorkflowTypeContext value={portTypeMap}>
      <BlockInputValuesContext value={inputValuesByNode}>
        <WorkflowIdContext value={workflow.id}>
          <div className="flex h-full">
            {!readonly && (
              <BlocksPanel isOpen={panelStates.blocks} onToggle={() => togglePanel('blocks')} />
            )}

            <EditorCanvas
              readonly={readonly}
              nodes={nodes}
              edges={displayEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onDragOver={readonly ? undefined : onDragOver}
              onDrop={readonly ? undefined : onDrop}
              leftCollapsed={leftCollapsed}
              inspectorCollapsed={inspectorCollapsed}
              hasSelection={!!selectedNode}
              togglePanel={togglePanel}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              diagnostics={diagnostics}
              onJumpToNode={handleJumpToNode}
            />

            {!readonly && (
              <InspectorPanel
                isOpen={panelStates.inspector}
                onToggle={() => togglePanel('inspector')}
                workflow={workflow}
                selectedNode={selectedNode}
                updateBlockConfig={updateBlockConfig}
                availableVariables={availableVariables}
                blockSchema={selectedBlockDef?.schema}
                viewModuleUrl={selectedBlockDef?.viewModuleUrl}
                pluginUid={selectedBlockDef?.pluginUid}
              />
            )}

            {!readonly && (
              <EditorCommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                blocks={blockDefinitions}
                nodes={nodes}
                canUndo={canUndo}
                canRedo={canRedo}
                onAddBlock={handlePaletteAdd}
                onJumpToNode={handleJumpToNode}
                onFitView={() => fitView({ duration: 300 })}
                onUndo={undo}
                onRedo={redo}
              />
            )}

            {!readonly && dropPicker && (
              <ConnectionDropPicker
                position={dropPicker.screen}
                candidates={dropCandidates}
                onPick={handleDropPick}
                onClose={() => setDropPicker(null)}
              />
            )}
          </div>
        </WorkflowIdContext>
      </BlockInputValuesContext>
    </WorkflowTypeContext>
  );
}

export interface WorkflowEditorProps {
  workflow: Workflow;
  readonly?: boolean;
  onChange?: (workflow: Workflow, isDirty: boolean) => void;
}

export function WorkflowEditor(props: Readonly<WorkflowEditorProps>) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
