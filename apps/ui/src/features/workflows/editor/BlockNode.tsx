/**
 * Block Node Component
 *
 * Dynamic block node with clear multi-input/multi-output visualization.
 */

import React from "react";
import { Position, type NodeProps, Handle } from "@xyflow/react";
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle, BaseNodeContent } from "@/components/base-node";
import { Badge, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { cn } from "@/lib/utils";
import type { BlockStatus } from "./useWorkflowEditor";

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
  then: "#22c55e", // green
  else: "#ef4444", // red
  true: "#22c55e",
  false: "#ef4444",
  success: "#22c55e",
  error: "#ef4444",
  default: "#6b7280", // gray
  out: "#3b82f6", // blue
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

function StatusIndicator({ status }: { status?: BlockStatus }) {
  if (!status || status === "idle") return null;

  if (status === "running") {
    return <Loader2 className="size-4 text-blue-500 animate-spin" />;
  }
  if (status === "completed") {
    return <CheckCircle className="size-4 text-green-500" />;
  }
  if (status === "error") {
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
            className="absolute -bottom-1 flex flex-col items-center cursor-pointer group"
            style={{ left: `${offset}%`, transform: "translateX(-50%)" }}
          >
            {/* Port label - shows on hover or always for multi-output */}
            {total > 1 && (
              <span
                className="text-[10px] font-semibold mb-0.5 opacity-90 uppercase tracking-wide"
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
                border: "3px solid var(--background)",
                boxShadow: `0 2px 4px ${portColor}40`,
                borderRadius: "50%",
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span className="font-semibold">{port.name}</span>
          {port.type && <span className="text-muted-foreground ml-1">({port.type})</span>}
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
          <div className="absolute -top-1" style={{ left: `${offset}%`, transform: "translateX(-50%)" }}>
            <Handle
              type="target"
              position={Position.Top}
              id={port.id}
              className="relative! transform-none!"
              style={{
                width: 12,
                height: 12,
                background: "#64748b",
                border: "3px solid var(--background)",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                borderRadius: "50%",
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <span className="font-semibold">{port.name}</span>
          {port.type && <span className="text-muted-foreground ml-1">({port.type})</span>}
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

  const iconName = (data.icon || "box") as IconName;
  const color = data.color || "#6b7280";
  const status = data.status || "idle";
  const config = data.config || {};
  const blockType = data.type || "";

  // Default ports if not specified
  const inputs: BlockPort[] = data.inputs ?? [{ id: "in", name: "Input" }];
  const outputs: BlockPort[] = data.outputs ?? [{ id: "out", name: "Output" }];

  // Render config summary based on config type
  const renderConfigSummary = (): React.ReactNode => {
    if (config.tool) {
      return (
        <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md block truncate font-mono">
          ⚡ {String(config.tool)}
        </code>
      );
    }
    if (config.if) {
      return (
        <code className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md block truncate font-mono">
          ❓ {String(config.if).slice(0, 35)}
        </code>
      );
    }
    if (config.duration) {
      return (
        <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
          ⏱️ {String(config.duration)}
        </div>
      );
    }
    if (config.event) {
      return (
        <code className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md block truncate font-mono">
          📤 {String(config.event)}
        </code>
      );
    }
    if (config.message) {
      return (
        <div className="text-xs bg-muted/50 px-2 py-1 rounded-md truncate">
          💬 "{String(config.message).slice(0, 25)}..."
        </div>
      );
    }
    if (config.var) {
      return (
        <code className="text-xs text-pink-600 dark:text-pink-400 bg-pink-500/10 px-2 py-1 rounded-md block truncate font-mono">
          📝 {String(config.var)} = ...
        </code>
      );
    }
    return null;
  };

  const hasMultipleOutputs = outputs.length > 1;

  const statusStyles: Record<string, string> = {
    idle: "",
    running: "ring-2 ring-blue-500 ring-offset-2 ring-offset-background animate-pulse",
    completed: "ring-2 ring-green-500 ring-offset-1 ring-offset-background",
    error: "ring-2 ring-red-500 ring-offset-1 ring-offset-background",
  };

  return (
    <BaseNode
      className={cn(
        "min-w-[200px] relative transition-all duration-200",
        hasMultipleOutputs && "pb-5", // Extra padding for output labels
        statusStyles[status] || "",
        selected && "ring-2 ring-primary ring-offset-2",
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
          className="size-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
          style={{ backgroundColor: color + "20", color }}
        >
          <DynamicIcon name={iconName} className="size-4" />
        </div>
        <BaseNodeHeaderTitle className="text-sm flex-1 truncate font-semibold">
          {data.label}
        </BaseNodeHeaderTitle>
        <StatusIndicator status={status} />
      </BaseNodeHeader>

      <BaseNodeContent className="pt-1 pb-2 space-y-2">
        {/* Block type badge */}
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="text-[10px] font-medium px-1.5 py-0"
            style={{ backgroundColor: color + "15", color }}
          >
            {(blockType || "block").split(":").pop()}
          </Badge>

          {/* Output count indicator for multi-output blocks */}
          {hasMultipleOutputs && (
            <span className="text-[10px] text-muted-foreground">{outputs.length} outputs</span>
          )}
        </div>

        {/* Config summary */}
        {renderConfigSummary()}

        {/* Execution output */}
        {status === "completed" && data.output !== undefined ? (
          <div className="p-2 bg-green-500/10 rounded-lg text-xs text-green-600 dark:text-green-400 truncate border border-green-500/20">
            ✓ {JSON.stringify(data.output).slice(0, 40)}
          </div>
        ) : null}

        {/* Error display */}
        {status === "error" && data.output ? (
          <div className="p-2 bg-red-500/10 rounded-lg text-xs text-red-600 dark:text-red-400 truncate border border-red-500/20">
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
