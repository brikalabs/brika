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

interface BlockPort {
  id: string;
  name: string;
  type?: string;
}

// Output port colors for semantic meaning
const OUTPUT_COLORS: Record<string, string> = {
  then: '#22c55e', // green
  else: '#ef4444', // red
  true: '#22c55e',
  false: '#ef4444',
  success: '#22c55e',
  error: '#ef4444',
  default: '#6b7280', // gray
  out: '#3b82f6', // blue
};

function getOutputColor(portId: string, fallback: string): string {
  return OUTPUT_COLORS[portId.toLowerCase()] || fallback;
}

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
// Output Port Component - Visual representation of output
// ─────────────────────────────────────────────────────────────────────────────

interface OutputPortProps {
  port: BlockPort;
  index: number;
  total: number;
  blockColor: string;
}

function OutputPort({ port, index, total, blockColor }: OutputPortProps) {
  const portColor = getOutputColor(port.id, blockColor);

  // Calculate horizontal position
  const offset = total > 1 ? ((index + 1) / (total + 1)) * 100 : 50;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="group absolute -bottom-1 flex cursor-pointer flex-col items-center"
            style={{ left: `${offset}%`, transform: 'translateX(-50%)' }}
          >
            {/* Port label - shows on hover or always for multi-output */}
            {total > 1 && (
              <span
                className="mb-0.5 font-semibold text-[10px] uppercase tracking-wide opacity-90"
                style={{ color: portColor }}
              >
                {port.name}
              </span>
            )}

            {/* Handle - larger and colored */}
            <Handle
              type="source"
              position={Position.Bottom}
              id={port.id}
              className="relative! transform-none!"
              style={{
                width: total > 1 ? 14 : 12,
                height: total > 1 ? 14 : 12,
                background: portColor,
                border: '3px solid var(--background)',
                boxShadow: `0 2px 4px ${portColor}40`,
                borderRadius: '50%',
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span className="font-semibold">{port.name}</span>
          {port.type && <span className="ml-1 text-muted-foreground">({port.type})</span>}
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

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute -top-1"
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
                background: '#64748b',
                border: '3px solid var(--background)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                borderRadius: '50%',
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <span className="font-semibold">{port.name}</span>
          {port.type && <span className="ml-1 text-muted-foreground">({port.type})</span>}
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

      {/* Output Handles with Labels */}
      {outputs.map((port: BlockPort, i: number) => (
        <OutputPort key={port.id} port={port} index={i} total={outputs.length} blockColor={color} />
      ))}
    </BaseNode>
  );
}
