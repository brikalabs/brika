/**
 * Block Node Component
 *
 * Dynamic block node with clear multi-input/multi-output visualization.
 */

import { Handle, type NodeProps, Position, useNodeId } from '@xyflow/react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import React, { memo } from 'react';
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '@/components/base-node';
import { Badge } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { BlockStatus } from './useWorkflowEditor';
import { usePortTypeName } from './WorkflowTypeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockPort {
  id: string;
  name: string;
  /** Type name: "string", "number", "object", "generic", etc. */
  typeName?: string;
  /** Structural type descriptor (JSON, from @brika/type-system) */
  type?: Record<string, unknown>;
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
    return <Loader2 className="size-4 animate-spin text-status-running" />;
  }
  if (status === 'completed') {
    return <CheckCircle className="size-4 text-status-completed" />;
  }
  if (status === 'error') {
    return <XCircle className="size-4 text-status-error" />;
  }
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Port Type Colors
// ─────────────────────────────────────────────────────────────────────────────

/** Map a resolved type kind to a port handle color */
function portColor(resolvedType: string | undefined, fallbackTypeName: string | undefined): string {
  const type = resolvedType ?? fallbackTypeName ?? '';
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
// Output Port Component
// ─────────────────────────────────────────────────────────────────────────────

interface OutputPortProps {
  port: BlockPort;
  index: number;
  total: number;
}

const OutputPort = memo(function OutputPort({ port, index, total }: Readonly<OutputPortProps>) {
  const nodeId = useNodeId() ?? '';
  const resolvedType = usePortTypeName(nodeId, port.id);
  const offset = total > 1 ? ((index + 1) / (total + 1)) * 100 : 50;
  const color = portColor(resolvedType, port.typeName);

  return (
    <>
      <Handle
        type="source"
        position={Position.Bottom}
        id={port.id}
        className="absolute! -bottom-1! h-3! w-3! rounded-full! border-2! border-background!"
        style={{ backgroundColor: color, left: `${offset}%`, transform: 'translateX(-50%)' }}
      />
      <span
        className="pointer-events-none absolute max-w-20 truncate text-center font-mono text-[9px] leading-tight"
        style={{ color, left: `${offset}%`, transform: 'translateX(-50%)', bottom: '-1.1rem' }}
        title={`${port.name}: ${resolvedType ?? port.typeName ?? 'generic<T>'}`}
      >
        {resolvedType ?? port.typeName ?? 'T'}
      </span>
    </>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Input Port Component
// ─────────────────────────────────────────────────────────────────────────────

interface InputPortProps {
  port: BlockPort;
  index: number;
  total: number;
}

const InputPort = memo(function InputPort({ port, index, total }: Readonly<InputPortProps>) {
  const nodeId = useNodeId() ?? '';
  const resolvedType = usePortTypeName(nodeId, port.id);
  const offset = total > 1 ? ((index + 1) / (total + 1)) * 100 : 50;
  const color = portColor(resolvedType, port.typeName);

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id={port.id}
        className="absolute! -top-1! h-3! w-3! rounded-full! border-2! border-background!"
        style={{ backgroundColor: color, left: `${offset}%`, transform: 'translateX(-50%)' }}
      />
      <span
        className="pointer-events-none absolute max-w-20 truncate text-center font-mono text-[9px] leading-tight"
        style={{ color, left: `${offset}%`, transform: 'translateX(-50%)', top: '-1.1rem' }}
        title={`${port.name}: ${resolvedType ?? port.typeName ?? 'generic<T>'}`}
      >
        {resolvedType ?? port.typeName ?? 'T'}
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

/** Render a summary snippet for a block's config */
function renderConfigSummary(config: Record<string, unknown>): React.ReactNode {
  if (config.tool) {
    return (
      <code className="block truncate rounded-md bg-muted/50 px-2 py-1 font-mono text-muted-foreground text-xs">
        ⚡ {configToString(config.tool)}
      </code>
    );
  }
  if (config.if) {
    return (
      <code className="block truncate rounded-md bg-warning/10 px-2 py-1 font-mono text-warning text-xs">
        ❓ {configToString(config.if).slice(0, 35)}
      </code>
    );
  }
  if (config.duration) {
    return (
      <div className="rounded-md bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
        ⏱️ {configToString(config.duration)}
      </div>
    );
  }
  if (config.event) {
    return (
      <code className="block truncate rounded-md bg-success/10 px-2 py-1 font-mono text-success text-xs">
        📤 {configToString(config.event)}
      </code>
    );
  }
  if (config.message) {
    return (
      <div className="truncate rounded-md bg-muted/50 px-2 py-1 text-xs">
        💬 "{configToString(config.message).slice(0, 25)}..."
      </div>
    );
  }
  if (config.var) {
    return (
      <code className="block truncate rounded-md bg-data-8/10 px-2 py-1 font-mono text-data-8 text-xs">
        📝 {configToString(config.var)} = ...
      </code>
    );
  }
  if (config.sparkType) {
    return (
      <code className="block truncate rounded-md bg-amber-500/10 px-2 py-1 font-mono text-amber-600 text-xs">
        ⚡ {configToString(config.sparkType)}
      </code>
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
      <div className="truncate rounded-lg border border-success/20 bg-success/10 p-2 text-success text-xs">
        ✓ {JSON.stringify(output).slice(0, 40)}
      </div>
    );
  }
  if (status === 'error' && output) {
    return (
      <div className="truncate rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-destructive text-xs">
        ✗ {configToString(output).slice(0, 40)}
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

export const BlockNode = memo(function BlockNode(props: NodeProps) {
  const { tp } = useLocale();
  const data = props.data as unknown as BlockNodeData;
  const selected = props.selected;

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

  const statusStyles: Record<string, string> = {
    idle: '',
    running: 'ring-2 ring-status-running ring-offset-2 ring-offset-background animate-pulse',
    completed: 'ring-2 ring-status-completed ring-offset-1 ring-offset-background',
    error: 'ring-2 ring-status-error ring-offset-1 ring-offset-background',
  };

  return (
    <BaseNode
      className={cn(
        'relative min-w-[200px] transition-all duration-200',
        statusStyles[status] || '',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {/* Input Handles */}
      {inputs.map((port: BlockPort, i: number) => (
        <InputPort key={port.id} port={port} index={i} total={inputs.length} />
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
      </BaseNodeContent>

      {/* Output Handles */}
      {outputs.map((port: BlockPort, i: number) => (
        <OutputPort key={port.id} port={port} index={i} total={outputs.length} />
      ))}
    </BaseNode>
  );
});
