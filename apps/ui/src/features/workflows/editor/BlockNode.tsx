/**
 * Block Node Component
 *
 * Dynamic block node with clear multi-input/multi-output visualization.
 */

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import React from 'react';
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '@/components/base-node';
import { Badge, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BlockStatus } from './useWorkflowEditor';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockPort {
  id: string;
  name: string;
  /** Type name: "string", "number", "object", "generic", etc. */
  typeName?: string;
}

// Simple colors: inputs = blue, outputs = orange
const INPUT_COLOR = '#3b82f6';
const OUTPUT_COLOR = '#f97316';

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

function StatusIndicator({ status }: Readonly<{ status?: BlockStatus }>) {
  if (!status || status === 'idle') return null;

  if (status === 'running') {
    return <Loader2 className="size-4 animate-spin text-blue-500" />;
  }
  if (status === 'completed') {
    return <CheckCircle className="size-4 text-green-500" />;
  }
  if (status === 'error') {
    return <XCircle className="size-4 text-red-500" />;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Port Component
// ─────────────────────────────────────────────────────────────────────────────

interface OutputPortProps {
  port: BlockPort;
  index: number;
  total: number;
}

function OutputPort({ port, index, total }: OutputPortProps) {
  const offset = total > 1 ? ((index + 1) / (total + 1)) * 100 : 50;
  const typeName = port.typeName ?? 'generic';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="group absolute -bottom-1 flex cursor-pointer flex-col items-center"
            style={{ left: `${offset}%`, transform: 'translateX(-50%)' }}
          >
            {total > 1 && (
              <span
                className="mb-0.5 font-semibold text-[10px] uppercase tracking-wide"
                style={{ color: OUTPUT_COLOR }}
              >
                {port.name}
              </span>
            )}
            <Handle
              type="source"
              position={Position.Bottom}
              id={port.id}
              className="relative! transform-none!"
              style={{
                width: total > 1 ? 14 : 12,
                height: total > 1 ? 14 : 12,
                background: OUTPUT_COLOR,
                border: '3px solid var(--background)',
                boxShadow: `0 2px 4px ${OUTPUT_COLOR}40`,
                borderRadius: '50%',
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span className="font-semibold">{port.name}</span>
          <span className="text-muted-foreground"> : {typeName}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Port Component
// ─────────────────────────────────────────────────────────────────────────────

interface InputPortProps {
  port: BlockPort;
  index: number;
  total: number;
}

function InputPort({ port, index, total }: InputPortProps) {
  const offset = total > 1 ? ((index + 1) / (total + 1)) * 100 : 50;
  const typeName = port.typeName ?? 'generic';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute -top-1 flex flex-col items-center"
            style={{ left: `${offset}%`, transform: 'translateX(-50%)' }}
          >
            <Handle
              type="target"
              position={Position.Top}
              id={port.id}
              className="relative! transform-none!"
              style={{
                width: 12,
                height: 12,
                background: INPUT_COLOR,
                border: '3px solid var(--background)',
                boxShadow: `0 2px 4px ${INPUT_COLOR}30`,
                borderRadius: '50%',
              }}
            />
            {total > 1 && (
              <span
                className="mt-0.5 font-medium text-[9px] uppercase tracking-tight"
                style={{ color: INPUT_COLOR }}
              >
                {port.name}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <span className="font-semibold">{port.name}</span>
          <span className="text-muted-foreground"> : {typeName}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Summary
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Block Node
// ─────────────────────────────────────────────────────────────────────────────

export function BlockNode(props: NodeProps) {
  const data = props.data as unknown as BlockNodeData;
  const selected = props.selected;

  const iconName = (data.icon || 'box') as IconName;
  const color = data.color || '#6b7280';
  const status = data.status || 'idle';
  const config = data.config || {};
  const blockType = data.type || '';

  // Default ports if not specified
  const inputs: BlockPort[] = data.inputs ?? [{ id: 'in', name: 'Input' }];
  const outputs: BlockPort[] = data.outputs ?? [{ id: 'out', name: 'Output' }];

  // Render config summary based on config type
  const renderConfigSummary = (): React.ReactNode => {
    if (config.tool) {
      return (
        <code className="block truncate rounded-md bg-muted/50 px-2 py-1 font-mono text-muted-foreground text-xs">
          ⚡ {String(config.tool)}
        </code>
      );
    }
    if (config.if) {
      return (
        <code className="block truncate rounded-md bg-amber-500/10 px-2 py-1 font-mono text-amber-600 text-xs dark:text-amber-400">
          ❓ {String(config.if).slice(0, 35)}
        </code>
      );
    }
    if (config.duration) {
      return (
        <div className="rounded-md bg-muted/50 px-2 py-1 text-muted-foreground text-xs">
          ⏱️ {String(config.duration)}
        </div>
      );
    }
    if (config.event) {
      return (
        <code className="block truncate rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-emerald-600 text-xs dark:text-emerald-400">
          📤 {String(config.event)}
        </code>
      );
    }
    if (config.message) {
      return (
        <div className="truncate rounded-md bg-muted/50 px-2 py-1 text-xs">
          💬 "{String(config.message).slice(0, 25)}..."
        </div>
      );
    }
    if (config.var) {
      return (
        <code className="block truncate rounded-md bg-pink-500/10 px-2 py-1 font-mono text-pink-600 text-xs dark:text-pink-400">
          📝 {String(config.var)} = ...
        </code>
      );
    }
    return null;
  };

  const hasMultipleOutputs = outputs.length > 1;

  const statusStyles: Record<string, string> = {
    idle: '',
    running: 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background animate-pulse',
    completed: 'ring-2 ring-green-500 ring-offset-1 ring-offset-background',
    error: 'ring-2 ring-red-500 ring-offset-1 ring-offset-background',
  };

  return (
    <BaseNode
      className={cn(
        'relative min-w-[200px] transition-all duration-200',
        hasMultipleOutputs && 'pb-5', // Extra padding for output labels
        statusStyles[status] || '',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      style={{
        borderLeftColor: color,
        borderLeftWidth: 4,
        borderRadius: 12,
      }}
    >
      {/* Input Handles */}
      {inputs.map((port: BlockPort, i: number) => (
        <InputPort key={port.id} port={port} index={i} total={inputs.length} />
      ))}

      <BaseNodeHeader className="pb-1">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm"
          style={{ backgroundColor: color + '20', color }}
        >
          <DynamicIcon name={iconName} className="size-4" />
        </div>
        <BaseNodeHeaderTitle className="flex-1 truncate font-semibold text-sm">
          {data.label}
        </BaseNodeHeaderTitle>
        <StatusIndicator status={status} />
      </BaseNodeHeader>

      <BaseNodeContent className="space-y-2 pt-1 pb-2">
        {/* Block type badge */}
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="px-1.5 py-0 font-medium text-[10px]"
            style={{ backgroundColor: color + '15', color }}
          >
            {(blockType || 'block').split(':').pop()}
          </Badge>

          {/* Output count indicator for multi-output blocks */}
          {hasMultipleOutputs && (
            <span className="text-[10px] text-muted-foreground">{outputs.length} outputs</span>
          )}
        </div>

        {/* Config summary */}
        {renderConfigSummary()}

        {/* Execution output */}
        {status === 'completed' && data.output !== undefined ? (
          <div className="truncate rounded-lg border border-green-500/20 bg-green-500/10 p-2 text-green-600 text-xs dark:text-green-400">
            ✓ {JSON.stringify(data.output).slice(0, 40)}
          </div>
        ) : null}

        {/* Error display */}
        {status === 'error' && data.output ? (
          <div className="truncate rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-600 text-xs dark:text-red-400">
            ✗ {String(data.output).slice(0, 40)}
          </div>
        ) : null}
      </BaseNodeContent>

      {/* Output Handles */}
      {outputs.map((port: BlockPort, i: number) => (
        <OutputPort key={port.id} port={port} index={i} total={outputs.length} />
      ))}
    </BaseNode>
  );
}
