/**
 * Block Node Component
 *
 * Dynamic block node with clear multi-input/multi-output visualization.
 */

import {
  Badge,
  Button,
  ButtonGroup,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@brika/clay';
import {
  displayType,
  isCompatible,
  type PortTypeMap,
  parsePortType,
  portKey,
  type TypeDescriptor,
} from '@brika/type-system';
import {
  Handle,
  type NodeProps,
  NodeToolbar,
  Position,
  useConnection,
  useNodeId,
  useUpdateNodeInternals,
} from '@xyflow/react';
import {
  CheckCircle,
  ChevronDown,
  Clock,
  HelpCircle,
  Loader2,
  MessageSquare,
  PencilLine,
  Play,
  RotateCcw,
  Send,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import React, { memo, useContext, useEffect } from 'react';
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '@/components/base-node';
import { useLocale } from '@/lib/use-locale';
import { injectBlock } from '../api';
import { resolveConfigForView, useBlockInputValues } from './block-input-values';
import { ClientBlockView } from './ClientBlockView';
import type { BlockStatus } from './useWorkflowEditor';
import { WorkflowTypeContext } from './WorkflowTypeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockPort {
  id: string;
  name: string;
  /** Structural type descriptor (JSON, from @brika/type-system) */
  type?: Record<string, unknown>;
  /** Config array key this port templates over (expanded per item in the editor). */
  dynamic?: string;
}

// Note: Colors now use CSS variables from theme system
// Input ports use --data-1 (blue), output ports use --data-2 (orange)

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockNodeData {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  // Block definition info
  icon?: string;
  color?: string;
  pluginId?: string;
  pluginUid?: string;
  /** URL of the plugin's compiled node-body display module, when it ships one. */
  nodeModuleUrl?: string;
  inputs?: BlockPort[];
  outputs?: BlockPort[];
  // Execution state
  status?: BlockStatus;
  output?: unknown;
  // Index signature for React Flow compatibility
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Indicator
// ─────────────────────────────────────────────────────────────────────────────

const StatusIndicator = memo(function StatusIndicator({
  status,
}: Readonly<{
  status?: BlockStatus;
}>) {
  if (!status || status === 'idle') {
    return null;
  }

  if (status === 'running') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-status-running/15">
        <Loader2 className="size-3 animate-spin text-status-running" />
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-status-completed/15">
        <CheckCircle className="size-3 text-status-completed" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-status-error/15">
        <XCircle className="size-3 text-status-error" />
      </span>
    );
  }
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Port Type Colors
// ─────────────────────────────────────────────────────────────────────────────

/** Map a resolved type kind to a port handle color */
function portColor(resolvedType: string | undefined, fallbackTypeDisplay: string): string {
  const type = resolvedType ?? fallbackTypeDisplay;
  if (type.startsWith('generic') || type === '') {
    return '#8b5cf6'; // violet — unresolved generic
  }
  if (type === 'string') {
    return '#22c55e'; // green
  }
  if (type === 'number') {
    return '#3b82f6'; // blue
  }
  if (type === 'boolean') {
    return '#f59e0b'; // amber
  }
  if (type.startsWith('{')) {
    return '#ec4899'; // pink — object
  }
  if (type.endsWith('[]')) {
    return '#06b6d4'; // cyan — array
  }
  if (type.includes('|')) {
    return '#a855f7'; // purple — union
  }
  return '#6b7280'; // gray — fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Port Component (inputs and outputs)
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN_SEPARATOR = '\u0000';

/**
 * The in-progress connection origin, encoded as a string so the per-frame
 * pointer updates of a wire drag never re-render the ports.
 */
function useConnectionOrigin(): {
  inProgress: boolean;
  fromNodeId: string;
  fromHandleId: string;
  fromHandleType: 'source' | 'target';
} {
  const encoded = useConnection((c) =>
    c.inProgress
      ? [
          c.fromNode.id,
          c.fromHandle.id ?? (c.fromHandle.type === 'source' ? 'out' : 'in'),
          c.fromHandle.type,
        ].join(ORIGIN_SEPARATOR)
      : ''
  );
  if (!encoded) {
    return { inProgress: false, fromNodeId: '', fromHandleId: '', fromHandleType: 'source' };
  }
  const [fromNodeId, fromHandleId, fromHandleType] = encoded.split(ORIGIN_SEPARATOR);
  return {
    inProgress: true,
    fromNodeId,
    fromHandleId,
    fromHandleType: fromHandleType === 'target' ? 'target' : 'source',
  };
}

type PortRole = 'origin' | 'candidate' | 'blocked' | null;

interface PortRoleContext {
  origin: ReturnType<typeof useConnectionOrigin>;
  nodeId: string;
  portId: string;
  direction: 'input' | 'output';
  typeMap: PortTypeMap;
  ownType: TypeDescriptor;
}

/**
 * Role of this port while a wire is being dragged: the drag origin itself, a
 * compatible candidate (glows), a type-incompatible port (dims), or null when
 * no drag is in progress / the port is on the same side as the origin.
 */
function computePortRole({
  origin,
  nodeId,
  portId,
  direction,
  typeMap,
  ownType,
}: Readonly<PortRoleContext>): PortRole {
  if (!origin.inProgress) {
    return null;
  }
  if (origin.fromNodeId === nodeId && origin.fromHandleId === portId) {
    return 'origin';
  }
  const isOppositeSide =
    direction === 'input' ? origin.fromHandleType === 'source' : origin.fromHandleType === 'target';
  if (!isOppositeSide || origin.fromNodeId === nodeId) {
    return null;
  }
  const originType = typeMap.get(portKey(origin.fromNodeId, origin.fromHandleId));
  const compatible =
    !originType ||
    (direction === 'input' ? isCompatible(originType, ownType) : isCompatible(ownType, originType));
  return compatible ? 'candidate' : 'blocked';
}

interface PortProps {
  port: BlockPort;
  index: number;
  total: number;
  direction: 'input' | 'output';
}

const Port = memo(function Port({ port, index, total, direction }: Readonly<PortProps>) {
  const nodeId = useNodeId() ?? '';
  const typeMap = useContext(WorkflowTypeContext);
  const resolved = typeMap.get(portKey(nodeId, port.id));
  const declared = parsePortType(port);
  const typeDisplay = resolved ? displayType(resolved) : displayType(declared);
  const offset = total > 1 ? ((index + 1) / (total + 1)) * 100 : 50;
  const color = portColor(resolved ? typeDisplay : undefined, typeDisplay);

  // Live feedback while a wire is being dragged: candidate ports glow,
  // type-incompatible ports dim, everything else stays untouched.
  const origin = useConnectionOrigin();
  const role = computePortRole({
    origin,
    nodeId,
    portId: port.id,
    direction,
    typeMap,
    ownType: resolved ?? declared,
  });

  const showTypeLabel = origin.inProgress && role !== null;
  const label = showTypeLabel ? typeDisplay : port.name;

  const handleStyle: React.CSSProperties = {
    backgroundColor: color,
    left: `${offset}%`,
    transform: role === 'candidate' ? 'translateX(-50%) scale(1.5)' : 'translateX(-50%)',
    boxShadow: role === 'candidate' ? `0 0 0 4px ${color}40` : undefined,
    opacity: role === 'blocked' ? 0.25 : undefined,
    transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
  };

  return (
    <>
      <Handle
        type={direction === 'input' ? 'target' : 'source'}
        position={direction === 'input' ? Position.Top : Position.Bottom}
        id={port.id}
        className={cn(
          'absolute! h-3! w-3! rounded-full! border-2! border-background!',
          direction === 'input' ? '-top-1!' : '-bottom-1!'
        )}
        style={handleStyle}
      />
      <span
        className={cn(
          'pointer-events-none absolute max-w-24 truncate text-center font-mono text-[9px] leading-tight',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
          String.raw`[.react-flow\_\_node.selected_&]:opacity-100`,
          showTypeLabel && 'opacity-100',
          role === 'blocked' && 'opacity-40!'
        )}
        style={{
          color,
          left: `${offset}%`,
          transform: 'translateX(-50%)',
          ...(direction === 'input' ? { top: '-1.1rem' } : { bottom: '-1.1rem' }),
        }}
        title={`${port.name}: ${typeDisplay}`}
      >
        {label}
      </span>
    </>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Config Summary
// ─────────────────────────────────────────────────────────────────────────────

/** Safely convert config values to strings */
function configToString(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

/** One config-summary chip: an icon plus a truncated value, color-themed. */
function ConfigSummaryChip({
  icon,
  className,
  mono = true,
  children,
}: Readonly<{
  icon: React.ReactNode;
  className: string;
  mono?: boolean;
  children: React.ReactNode;
}>) {
  return (
    <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${className}`}>
      <span className="shrink-0">{icon}</span>
      <span className={`truncate ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  );
}

/** Render a summary snippet for a block's config (lucide icons, never emoji). */
function renderConfigSummary(config: Record<string, unknown>): React.ReactNode {
  if (config.tool) {
    return (
      <ConfigSummaryChip
        icon={<Wrench className="size-3" />}
        className="bg-muted/50 text-muted-foreground"
      >
        {configToString(config.tool)}
      </ConfigSummaryChip>
    );
  }
  if (config.if) {
    return (
      <ConfigSummaryChip
        icon={<HelpCircle className="size-3" />}
        className="bg-warning/10 text-warning"
      >
        {configToString(config.if).slice(0, 35)}
      </ConfigSummaryChip>
    );
  }
  if (config.duration) {
    return (
      <ConfigSummaryChip
        icon={<Clock className="size-3" />}
        className="bg-muted/50 text-muted-foreground"
        mono={false}
      >
        {configToString(config.duration)}
      </ConfigSummaryChip>
    );
  }
  if (config.event) {
    return (
      <ConfigSummaryChip icon={<Send className="size-3" />} className="bg-success/10 text-success">
        {configToString(config.event)}
      </ConfigSummaryChip>
    );
  }
  if (config.message) {
    return (
      <ConfigSummaryChip
        icon={<MessageSquare className="size-3" />}
        className="bg-muted/50"
        mono={false}
      >
        "{configToString(config.message).slice(0, 25)}..."
      </ConfigSummaryChip>
    );
  }
  if (config.var) {
    return (
      <ConfigSummaryChip
        icon={<PencilLine className="size-3" />}
        className="bg-data-8/10 text-data-8"
      >
        {configToString(config.var)} = ...
      </ConfigSummaryChip>
    );
  }
  if (config.sparkType) {
    return (
      <ConfigSummaryChip
        icon={<Zap className="size-3" />}
        className="bg-amber-500/10 text-amber-600"
      >
        {configToString(config.sparkType)}
      </ConfigSummaryChip>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Result
// ─────────────────────────────────────────────────────────────────────────────

interface ExecutionResultProps {
  status: string;
  output: unknown;
}

/** Render execution output or error for a completed/errored block. */
const ExecutionResult = memo(function ExecutionResult({
  status,
  output,
}: Readonly<ExecutionResultProps>) {
  if (status === 'completed' && output !== undefined) {
    return (
      <div className="flex items-center gap-1.5 truncate rounded-lg border border-success/20 bg-success/10 p-2 text-success text-xs">
        <CheckCircle className="size-3 shrink-0" />
        <span className="truncate font-mono">{JSON.stringify(output).slice(0, 40)}</span>
      </div>
    );
  }
  if (status === 'error' && output) {
    return (
      <div className="flex items-center gap-1.5 truncate rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-destructive text-xs">
        <XCircle className="size-3 shrink-0" />
        <span className="truncate font-mono">{configToString(output).slice(0, 40)}</span>
      </div>
    );
  }
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Block Node
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_INPUTS: BlockPort[] = [{ id: 'in', name: 'Input' }];
const DEFAULT_OUTPUTS: BlockPort[] = [{ id: 'out', name: 'Output' }];

/**
 * Run control for a selected block: the primary action re-triggers it with
 * the LAST value that flowed into its input (replay); the dropdown offers an
 * empty trigger for blocks that just need a poke.
 */
function RunBlockButton({
  blockId,
  port,
}: Readonly<{
  blockId: string;
  port: string;
}>) {
  const { t } = useLocale();

  const run = async (replay: boolean) => {
    try {
      const res = await injectBlock(blockId, port, { replay });
      if (!res.ok) {
        toast.error(t('workflows:editor.runBlock.notRunning'));
      }
    } catch {
      toast.error(t('workflows:editor.runBlock.failed'));
    }
  };

  const segment =
    'h-7 border-primary/30 bg-background/95 font-medium text-primary text-xs shadow-lg backdrop-blur hover:bg-primary/10 hover:text-primary';

  return (
    <ButtonGroup>
      <Button
        size="sm"
        variant="outline"
        className={cn(segment, 'gap-1.5 px-3')}
        title={t('workflows:editor.runBlock.replayHint')}
        onClick={() => run(true)}
      >
        <Play className="size-3 fill-current" />
        {t('workflows:editor.runBlock.label')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={cn(segment, 'px-1.5')}>
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          <DropdownMenuItem onClick={() => run(true)}>
            <RotateCcw className="size-3.5" />
            {t('workflows:editor.runBlock.replay')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(false)}>
            <Play className="size-3.5" />
            {t('workflows:editor.runBlock.empty')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

export const BlockNode = memo(function BlockNode(props: NodeProps) {
  const { tp } = useLocale();
  const data = props.data as unknown as BlockNodeData;
  const selected = props.selected;
  const inputValues = useBlockInputValues(typeof data.id === 'string' ? data.id : '');

  const iconName = (data.icon || 'box') as IconName;
  const color = data.color || '#6b7280';
  const status = data.status || 'idle';
  const config = data.config || {};
  const blockType = data.type || '';

  // Translate block label if pluginId is available
  const blockKey = blockType.split(':').pop() || blockType;
  const displayLabel = data.pluginId
    ? tp(data.pluginId, `blocks.${blockKey}.name`, data.label)
    : data.label;

  // Default ports if not specified (DEFAULT_* are stable module-level refs)
  const inputs = data.inputs ?? DEFAULT_INPUTS;
  const outputs = data.outputs ?? DEFAULT_OUTPUTS;

  // Dynamic template ports (switch cases, ...) appear and disappear with the
  // config. React Flow caches handle positions per node, so it must re-measure
  // whenever the port set changes or edges keep anchoring to stale spots.
  const updateNodeInternals = useUpdateNodeInternals();
  const portsSignature = [...inputs, ...outputs].map((p) => p.id).join('|');
  useEffect(() => {
    updateNodeInternals(data.id);
  }, [portsSignature, updateNodeInternals, data.id]);

  const statusStyles: Record<string, string> = {
    idle: '',
    running: 'ring-2 ring-status-running ring-offset-2 ring-offset-background animate-pulse',
    completed: 'ring-1 ring-status-completed/50',
    error: 'ring-1 ring-status-error/60',
  };

  return (
    <BaseNode
      className={cn(
        'group relative w-64 transition-all duration-200',
        statusStyles[status] || '',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {/* Run-once toolbar (selected nodes with a pokeable input). Sits above
          the node so it never collides with the inspector panel. */}
      {inputs.length > 0 && (
        <NodeToolbar isVisible={selected} position={Position.Top} align="end" offset={10}>
          <RunBlockButton blockId={data.id} port={inputs[0].id} />
        </NodeToolbar>
      )}

      {/* Input Handles */}
      {inputs.map((port: BlockPort, i: number) => (
        <Port key={port.id} port={port} index={i} total={inputs.length} direction="input" />
      ))}

      <BaseNodeHeader className="pb-1">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm"
          style={{
            backgroundColor: `${color}20`,
            color,
          }}
        >
          <DynamicIcon name={iconName} className="size-4" />
        </div>
        <BaseNodeHeaderTitle className="flex-1 truncate font-semibold text-sm">
          {displayLabel}
        </BaseNodeHeaderTitle>
        <StatusIndicator status={status} />
      </BaseNodeHeader>

      <BaseNodeContent className="space-y-2 pt-1 pb-2">
        {data.nodeModuleUrl && data.pluginUid && data.pluginId ? (
          // Plugin-authored node-body display owns the content entirely.
          <ClientBlockView
            blockId={data.id}
            blockType={blockType}
            pluginName={data.pluginId}
            pluginUid={data.pluginUid}
            moduleUrl={data.nodeModuleUrl}
            scopeId={`${data.pluginId}:blocks/${blockKey}.node`}
            config={resolveConfigForView(config, inputValues)}
            data={data.output}
            compact
          />
        ) : (
          <>
            {/* Block type badge */}
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="px-1.5 py-0 font-medium text-[10px]"
                style={{
                  backgroundColor: `${color}15`,
                  color,
                }}
              >
                {(blockType || 'block').split(':').pop()}
              </Badge>
            </div>

            {/* Config summary */}
            {renderConfigSummary(config)}

            {/* Execution result */}
            <ExecutionResult status={status} output={data.output} />
          </>
        )}
      </BaseNodeContent>

      {/* Output Handles */}
      {outputs.map((port: BlockPort, i: number) => (
        <Port key={port.id} port={port} index={i} total={outputs.length} direction="output" />
      ))}
    </BaseNode>
  );
});
