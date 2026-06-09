import { Button, cn, toast } from '@brika/clay';
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
  AlertTriangle,
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
import { fetchWorkflowPortValues, type Workflow } from '../api';
import { type DebugEvent, useDebugStream } from '../debug';
import { BlockNode } from './BlockNode';
import { type BlockDefinition, BlockToolbar, type BlockTypeInfo } from './BlockToolbar';
import { BlockInputValuesContext, collectInputValues } from './block-input-values';
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
import { collectDiagnostics, type GraphDiagnostic, invalidEdgeIds } from './graph-diagnostics';
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
  setBlockStatus: (blockId: string, status: BlockStatus, output?: unknown) => void,
  setPortValue: (blockId: string, port: string, value: unknown) => void
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
      setPortValue(event.blockId, event.port, event.data);
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

type PanelName = 'blocks' | 'inspector';

interface PanelStates {
  blocks: boolean;
  inspector: boolean;
}

// One panel per side. The block library starts collapsed (Cmd+K and the
// wire-drop picker cover adding blocks); the right inspector carries either
// the selected block's config or the runs/live observability, never both.
const DEFAULT_PANEL_STATES: PanelStates = {
  blocks: false,
  inspector: true,
};

const PANEL_STORAGE_KEY = 'workflow-editor-panels-v2';

function isValidPanelStates(value: unknown): value is PanelStates {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blocks' in value &&
    'inspector' in value &&
    typeof (value as PanelStates).blocks === 'boolean' &&
    typeof (value as PanelStates).inspector === 'boolean'
  );
}

function usePanelState() {
  const capture = useCapture();
  const [panelStates, setPanelStates] = useState<PanelStates>(() => {
    try {
      const saved = localStorage.getItem(PANEL_STORAGE_KEY);
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
        localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [capture]
  );

  const openPanel = useCallback((panel: PanelName) => {
    setPanelStates((prev: PanelStates) => {
      if (prev[panel]) {
        return prev;
      }
      const next = { ...prev, [panel]: true };
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    panelStates,
    togglePanel,
    openPanel,
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

interface InspectorPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  workflow: Workflow;
  selectedNode: Node | null;
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

/**
 * The single right-hand panel. Focused, never stacked: a selected block shows
 * its configuration; an empty selection shows the workflow's runs/live
 * observability. Click the canvas to get back to the workflow view.
 */
function InspectorPanel({
  isOpen,
  onToggle,
  workflow,
  selectedNode,
  updateBlockConfig,
  availableVariables,
  blockSchema,
  viewModuleUrl,
  pluginUid,
}: Readonly<InspectorPanelProps>) {
  const { t } = useLocale();

  return (
    <CollapsiblePanel
      side="right"
      icon={
        selectedNode ? <Settings2 className="size-4" /> : <Zap className="size-4 text-yellow-500" />
      }
      title={
        selectedNode ? t('workflows:editor.panels.config') : t('workflows:editor.panels.debug')
      }
      isOpen={isOpen}
      onToggle={onToggle}
      width="w-88"
    >
      {selectedNode ? (
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
      ) : (
        <DebugPanel workflow={workflow} className="h-full w-full" onCollapse={onToggle} />
      )}
    </CollapsiblePanel>
  );
}

interface DiagnosticsBadgeProps {
  diagnostics: ReadonlyArray<GraphDiagnostic>;
  onJump: (nodeId: string) => void;
}

/**
 * Canvas problems chip: errors/warnings the engine would hit at runtime
 * (stale type mismatches, missing required config, removed block types,
 * feedback loops). Click an entry to jump to the offending node.
 */
function DiagnosticsBadge({ diagnostics, onJump }: Readonly<DiagnosticsBadgeProps>) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  if (diagnostics.length === 0) {
    return null;
  }
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;

  return (
    <Panel position="top-center">
      <div className="flex max-w-130 flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-xs shadow-md backdrop-blur transition-colors',
            errors > 0
              ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
              : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'
          )}
        >
          <AlertTriangle className="size-3.5" />
          {errors > 0 && `${errors} ${t('workflows:editor.diagnostics.errors')}`}
          {errors > 0 && warnings > 0 && ' · '}
          {warnings > 0 && `${warnings} ${t('workflows:editor.diagnostics.warnings')}`}
        </button>
        {open && (
          <div className="max-h-60 w-130 overflow-y-auto rounded-lg border bg-popover/95 p-1 shadow-xl backdrop-blur">
            {diagnostics.map((d) => (
              <button
                key={`${d.kind}:${d.nodeId}:${d.edgeId ?? ''}:${d.message}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onJump(d.nodeId);
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                <AlertTriangle
                  className={cn(
                    'mt-0.5 size-3 shrink-0',
                    d.severity === 'error' ? 'text-destructive' : 'text-warning'
                  )}
                />
                <span className="min-w-0 break-words">{d.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Panel>
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
  hasSelection: boolean;
  togglePanel: (panel: PanelName) => void;
}

function RightCollapsedTabs({ hasSelection, togglePanel }: Readonly<RightCollapsedTabsProps>) {
  const { t } = useLocale();

  return (
    <CollapsedTabsContainer side="right">
      <CollapsedTab
        side="right"
        icon={
          hasSelection ? (
            <Settings2 className="size-4" />
          ) : (
            <Zap className="size-4 text-yellow-500" />
          )
        }
        title={
          hasSelection ? t('workflows:editor.panels.config') : t('workflows:editor.panels.debug')
        }
        onExpand={() => togglePanel('inspector')}
      />
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
