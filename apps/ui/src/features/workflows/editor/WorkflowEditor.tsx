import { Button, toast } from '@brika/clay';
import { portKey } from '@brika/type-system';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  ConnectionLineType,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeTypes,
  type OnConnectEnd,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import {
  Blocks,
  GripVertical,
  Loader2,
  Lock,
  Maximize2,
  Minus,
  MousePointerClick,
  Plus,
  Redo2,
  Settings2,
  Undo2,
  Unlock,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import '@xyflow/react/dist/style.css';
import type { Workflow } from '../api';
import { type DebugEvent, useDebugStream } from '../debug';
import { BlockNode } from './BlockNode';
import { type BlockDefinition, BlockToolbar, type BlockTypeInfo } from './BlockToolbar';
import { CollapsedTab, CollapsedTabsContainer, CollapsiblePanel } from './CollapsiblePanel';
import { ConfigPanel } from './ConfigPanel';
import { ConnectionDropPicker } from './ConnectionDropPicker';
import {
  type CompatibleBlock,
  compatibleBlocksForSource,
  compatibleBlocksForTarget,
  typeLabel,
} from './connection-compat';
import { DebugPanel } from './DebugPanel';
import { EditorCommandPalette } from './EditorCommandPalette';
import { type ConnectionOrigin, useWorkflowEditor } from './useWorkflowEditor';
import { WorkflowTypeContext } from './WorkflowTypeContext';
import type { BlockStatus } from './workflow-conversion';

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

// Simple ping animation using DOM manipulation
function pingHandle(blockId: string, portId: string) {
  const selector = `.react-flow__node[data-id="${blockId}"] .react-flow__handle[data-handleid="${portId}"]`;
  const handle = document.querySelector<HTMLElement>(selector);

  if (handle) {
    // Remove class first to allow re-triggering
    handle.classList.remove('handle-ping');
    // Force reflow to restart animation
    handle.getClientRects();
    handle.classList.add('handle-ping');
    // Self-cleaning via animationend — no dangling setTimeout
    handle.addEventListener('animationend', () => handle.classList.remove('handle-ping'), {
      once: true,
    });
  }
}

// Drive a block's status ring from a run lifecycle / emit / error event.
// block.start -> running (received input), block.emit -> completed (produced
// output), block.error -> error. States persist until the block next runs.
function applyBlockStatus(
  event: DebugEvent,
  setBlockStatus: (blockId: string, status: BlockStatus, output?: unknown) => void
) {
  if (!event.blockId) {
    return;
  }
  if (event.type === 'block.start') {
    setBlockStatus(event.blockId, 'running');
  } else if (event.type === 'block.error') {
    setBlockStatus(event.blockId, 'error', event.data);
  } else if (event.type === 'block.emit') {
    setBlockStatus(event.blockId, 'completed', event.data);
  }
}

// Ping the emitting output handle and every connected downstream input handle.
function pingEventPorts(blockId: string, port: string, edges: Edge[]) {
  pingHandle(blockId, port);
  for (const edge of edges) {
    if (edge.source === blockId && edge.sourceHandle === port) {
      pingHandle(edge.target, edge.targetHandle || 'in');
    }
  }
}

// Process new debug events: drive status rings, feed the latest emitted value
// into node-body views (useBlockData), and ping the relevant port handles.
function processNewEvents(
  events: DebugEvent[],
  edges: Edge[],
  lastProcessedTimestamp: React.RefObject<number>,
  setBlockLiveOutput: (blockId: string, output: unknown) => void,
  setBlockStatus: (blockId: string, status: BlockStatus, output?: unknown) => void
) {
  const newEvents = events.filter((e) => e.timestamp > lastProcessedTimestamp.current);

  if (newEvents.length > 0) {
    lastProcessedTimestamp.current = Math.max(...newEvents.map((e) => e.timestamp));
  }

  for (const event of newEvents) {
    applyBlockStatus(event, setBlockStatus);

    if (event.type !== 'block.emit' || !event.blockId || !event.port) {
      continue;
    }
    if (event.data !== undefined) {
      setBlockLiveOutput(event.blockId, event.data);
    }
    pingEventPorts(event.blockId, event.port, edges);
  }
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

type PanelName = 'blocks' | 'config' | 'debug';

interface PanelStates {
  blocks: boolean;
  config: boolean;
  debug: boolean;
}

const DEFAULT_PANEL_STATES: PanelStates = {
  blocks: true,
  config: true,
  debug: true,
};

function isValidPanelStates(value: unknown): value is PanelStates {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blocks' in value &&
    'config' in value &&
    'debug' in value &&
    typeof (value as PanelStates).blocks === 'boolean' &&
    typeof (value as PanelStates).config === 'boolean' &&
    typeof (value as PanelStates).debug === 'boolean'
  );
}

function usePanelState() {
  const capture = useCapture();
  const [panelStates, setPanelStates] = useState<PanelStates>(() => {
    try {
      const saved = localStorage.getItem('workflow-editor-panels');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isValidPanelStates(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return DEFAULT_PANEL_STATES;
  });

  const togglePanel = useCallback(
    (panel: PanelName) => {
      setPanelStates((prev: PanelStates) => {
        const next = {
          ...prev,
          [panel]: !prev[panel],
        };
        capture('workflow.editor_panel_toggled', { panel, open: next[panel] });
        localStorage.setItem('workflow-editor-panels', JSON.stringify(next));
        return next;
      });
    },
    [capture]
  );

  return {
    panelStates,
    togglePanel,
  };
}

interface BlocksPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

function BlocksPanel({ isOpen, onToggle }: Readonly<BlocksPanelProps>) {
  const { t } = useLocale();

  return (
    <CollapsiblePanel
      side="left"
      icon={<Blocks className="size-4" />}
      title={t('workflows:editor.panels.blocks')}
      isOpen={isOpen}
      onToggle={onToggle}
      width="w-56"
    >
      <BlockToolbar className="h-full w-full" onCollapse={onToggle} />
    </CollapsiblePanel>
  );
}

interface ConfigSidePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedNode: Node;
  updateBlockConfig: (nodeId: string, config: Record<string, unknown>) => void;
  availableVariables: Array<{
    name: string;
    source: string;
    type: string;
    preview?: string;
  }>;
  blockSchema: BlockDefinition['schema'] | undefined;
  viewModuleUrl: string | undefined;
  pluginUid: string | undefined;
}

function ConfigSidePanel({
  isOpen,
  onToggle,
  selectedNode,
  updateBlockConfig,
  availableVariables,
  blockSchema,
  viewModuleUrl,
  pluginUid,
}: Readonly<ConfigSidePanelProps>) {
  const { t } = useLocale();

  return (
    <CollapsiblePanel
      side="right"
      icon={<Settings2 className="size-4" />}
      title={t('workflows:editor.panels.config')}
      isOpen={isOpen}
      onToggle={onToggle}
      width="w-80"
    >
      <ConfigPanel
        node={selectedNode}
        onUpdateBlock={updateBlockConfig}
        availableVariables={availableVariables}
        blockSchema={blockSchema}
        viewModuleUrl={viewModuleUrl}
        pluginUid={pluginUid}
        className="h-full w-full"
        onCollapse={onToggle}
      />
    </CollapsiblePanel>
  );
}

interface DebugSidePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  workflow: Workflow;
}

function DebugSidePanel({ isOpen, onToggle, workflow }: Readonly<DebugSidePanelProps>) {
  const { t } = useLocale();

  return (
    <CollapsiblePanel
      side="right"
      icon={<Zap className="size-4 text-yellow-500" />}
      title={t('workflows:editor.panels.debug')}
      isOpen={isOpen}
      onToggle={onToggle}
      width="w-72"
    >
      <DebugPanel workflow={workflow} className="h-full w-full" onCollapse={onToggle} />
    </CollapsiblePanel>
  );
}

interface EditorControlsProps {
  showInteractive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function EditorControls({
  showInteractive,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Readonly<EditorControlsProps>) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const store = useStoreApi();
  const capture = useCapture();
  const [locked, setLocked] = useState(false);

  const toggleLock = useCallback(() => {
    setLocked((prev) => {
      const next = !prev;
      capture('workflow.canvas_lock_toggled', { locked: next });
      store.setState({
        nodesDraggable: !next,
        nodesConnectable: !next,
        elementsSelectable: !next,
      });
      return next;
    });
  }, [store, capture]);

  return (
    <Panel position="bottom-left">
      <div className="flex flex-col rounded-md border bg-background shadow-sm">
        {showInteractive && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-none rounded-t-md"
              disabled={!canUndo}
              onClick={() => {
                capture('workflow.canvas_undo');
                onUndo();
              }}
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-none"
              disabled={!canRedo}
              onClick={() => {
                capture('workflow.canvas_redo');
                onRedo();
              }}
            >
              <Redo2 className="size-3.5" />
            </Button>
          </>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none rounded-t-md"
          onClick={() => {
            capture('workflow.canvas_zoom_in');
            zoomIn();
          }}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none"
          onClick={() => {
            capture('workflow.canvas_zoom_out');
            zoomOut();
          }}
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none"
          onClick={() => {
            capture('workflow.canvas_fit_view');
            fitView();
          }}
        >
          <Maximize2 className="size-3.5" />
        </Button>
        {showInteractive && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-none rounded-b-md"
            onClick={toggleLock}
          >
            {locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
          </Button>
        )}
      </div>
    </Panel>
  );
}

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
  configCollapsed: boolean;
  debugCollapsed: boolean;
  togglePanel: (panel: PanelName) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
  configCollapsed,
  debugCollapsed,
  togglePanel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
      </ReactFlow>

      {nodes.length === 0 && !readonly && <EmptyStateOverlay />}

      {(configCollapsed || debugCollapsed) && (
        <RightCollapsedTabs
          configCollapsed={configCollapsed}
          debugCollapsed={debugCollapsed}
          togglePanel={togglePanel}
        />
      )}
    </div>
  );
}

interface LeftCollapsedTabsProps {
  togglePanel: (panel: PanelName) => void;
}

function LeftCollapsedTabs({ togglePanel }: Readonly<LeftCollapsedTabsProps>) {
  const { t } = useLocale();

  return (
    <CollapsedTabsContainer side="left">
      <CollapsedTab
        side="left"
        icon={<Blocks className="size-4" />}
        title={t('workflows:editor.panels.blocks')}
        onExpand={() => togglePanel('blocks')}
      />
    </CollapsedTabsContainer>
  );
}

interface RightCollapsedTabsProps {
  configCollapsed: boolean;
  debugCollapsed: boolean;
  togglePanel: (panel: PanelName) => void;
}

function RightCollapsedTabs({
  configCollapsed,
  debugCollapsed,
  togglePanel,
}: Readonly<RightCollapsedTabsProps>) {
  const { t } = useLocale();

  return (
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
  );
}

function EmptyStateOverlay() {
  const { t } = useLocale();

  return (
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

/** Client coordinates of a mouse or touch connect-end event. */
function eventClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];
    return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
  }
  return { x: event.clientX, y: event.clientY };
}

/** Resolve the dragged handle into a ConnectionOrigin, defaulting handle ids. */
function connectionOriginOf(connectionState: FinalConnectionState): ConnectionOrigin | null {
  const { fromNode, fromHandle } = connectionState;
  if (!fromNode || !fromHandle) {
    return null;
  }
  const handleType = fromHandle.type;
  return {
    nodeId: fromNode.id,
    handleId: fromHandle.id ?? (handleType === 'source' ? 'out' : 'in'),
    handleType,
  };
}

function WorkflowEditorWithBlocks({
  workflow: initialWorkflow,
  blockDefinitions,
  readonly = false,
  onChange,
}: Readonly<WorkflowEditorWithBlocksProps>) {
  const { t } = useLocale();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { panelStates, togglePanel } = usePanelState();
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
    processNewEvents(events, edges, lastProcessedTimestamp, setBlockLiveOutput, setBlockStatus);
  }, [events, edges, setBlockLiveOutput, setBlockStatus]);

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

  // Check which panels are collapsed for stacking
  const leftCollapsed = !readonly && !panelStates.blocks;
  const configCollapsed = !readonly && !!selectedNode && !panelStates.config;
  const debugCollapsed = !readonly && !panelStates.debug;

  return (
    <WorkflowTypeContext value={portTypeMap}>
      <div className="flex h-full">
        {!readonly && (
          <BlocksPanel isOpen={panelStates.blocks} onToggle={() => togglePanel('blocks')} />
        )}

        <EditorCanvas
          readonly={readonly}
          nodes={nodes}
          edges={edges}
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
          configCollapsed={configCollapsed}
          debugCollapsed={debugCollapsed}
          togglePanel={togglePanel}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />

        {!readonly && selectedNode && (
          <ConfigSidePanel
            isOpen={panelStates.config}
            onToggle={() => togglePanel('config')}
            selectedNode={selectedNode}
            updateBlockConfig={updateBlockConfig}
            availableVariables={availableVariables}
            blockSchema={selectedBlockDef?.schema}
            viewModuleUrl={selectedBlockDef?.viewModuleUrl}
            pluginUid={selectedBlockDef?.pluginUid}
          />
        )}

        {!readonly && (
          <DebugSidePanel
            isOpen={panelStates.debug}
            onToggle={() => togglePanel('debug')}
            workflow={workflow}
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
