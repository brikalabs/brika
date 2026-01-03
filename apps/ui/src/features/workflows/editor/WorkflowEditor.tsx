import React, { useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/lib/use-locale";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type NodeTypes,
  ConnectionLineType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BlockNode, type BlockNodeData } from "./BlockNode";
import { TriggerNode } from "./TriggerNode";
import { BlockToolbar, type BlockTypeInfo, type BlockDefinition } from "./BlockToolbar";
import { ConfigPanel } from "./ConfigPanel";
import { DebugPanel } from "./DebugPanel";
import { useWorkflowEditor } from "./useWorkflowEditor";
import type { Workflow } from "../api";
import { Button, Badge } from "@/components/ui";
import { Save, RotateCcw, Play } from "lucide-react";

// Fetch all block definitions with schemas
async function fetchBlockDefinitions(): Promise<BlockDefinition[]> {
  const res = await fetch("/api/blocks");
  if (!res.ok) return [];
  return res.json();
}

// Node types for React Flow
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  block: BlockNode,
};

interface WorkflowEditorInnerProps {
  workflow: Workflow;
  readonly?: boolean;
  onSave?: (workflow: Workflow) => Promise<void>;
  onTest?: (workflow: Workflow, payload: Record<string, unknown>) => void;
}

function WorkflowEditorInner({
  workflow: initialWorkflow,
  readonly = false,
  onSave,
  onTest,
}: WorkflowEditorInnerProps) {
  const { t } = useLocale();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const editor = useWorkflowEditor(initialWorkflow);

  // Fetch block definitions for schemas
  const { data: blockDefinitions = [] } = useQuery({
    queryKey: ["blocks"],
    queryFn: fetchBlockDefinitions,
    staleTime: 60000,
  });

  // Create a map of block type -> definition for quick lookup
  const blockSchemaMap = useMemo(() => {
    const map: Record<string, BlockDefinition> = {};
    for (const def of blockDefinitions) {
      map[def.type || def.id] = def;
      // Also map by just the ID part for legacy blocks
      const idPart = (def.type || def.id).split(":").pop();
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
    updateTriggerConfig,
    blockStatuses,
    executionLogs,
    setBlockStatus,
    addExecutionLog,
    clearExecutionState,
    getAvailableVariables,
  } = editor;

  // Handle drop from toolbar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const data = event.dataTransfer.getData("application/reactflow");

      if (!data || !reactFlowBounds) return;

      const blockDef: BlockDefinition = JSON.parse(data);
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      };

      // Convert BlockDefinition to BlockTypeInfo for addBlock
      const blockType: BlockTypeInfo = {
        type: blockDef.type || blockDef.id,
        name: blockDef.name,
        description: blockDef.description,
        icon: blockDef.icon,
        color: blockDef.color,
        category: blockDef.category as "flow" | "action" | "data" | "debug",
        inputs: blockDef.inputs,
        outputs: blockDef.outputs,
        defaultConfig: {},
      };

      addBlock(blockType, position);
    },
    [addBlock],
  );

  // Handle save
  const handleSave = async () => {
    if (onSave) {
      await onSave(workflow);
    }
  };

  // Handle test
  const handleTest = (payload: Record<string, unknown>) => {
    clearExecutionState();
    onTest?.(workflow, payload);
  };

  // Get available variables for selected block
  const availableVariables = selectedNode ? getAvailableVariables(selectedNode.id) : [];

  // Get block schema for selected node
  const selectedBlockSchema = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "block") return undefined;
    const blockData = selectedNode.data as unknown as BlockNodeData;
    const blockType = blockData.type || "";
    return blockSchemaMap[blockType]?.schema;
  }, [selectedNode, blockSchemaMap]);

  return (
    <div className="flex h-full">
      {/* Block Toolbar */}
      {!readonly && <BlockToolbar className="w-56 shrink-0" />}

      {/* Canvas */}
      <div className="flex-1 flex flex-col" ref={reactFlowWrapper}>
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
          deleteKeyCode={readonly ? null : "Backspace"}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={!readonly} />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === "trigger") return "#22c55e";
              const blockData = node.data as BlockNodeData;
              const colors: Record<string, string> = {
                action: "#3b82f6",
                condition: "#f59e0b",
                switch: "#8b5cf6",
                delay: "#6b7280",
                emit: "#10b981",
                set: "#ec4899",
                log: "#78716c",
                end: "#dc2626",
              };
              return colors[blockData?.type] || "#6b7280";
            }}
            className="!bg-muted"
          />

          {/* Top toolbar */}
          {!readonly && (
            <Panel position="top-right" className="flex items-center gap-2">
              {isDirty && (
                <Badge variant="secondary" className="text-xs">
                  {t("workflows:editor.unsavedChanges")}
                </Badge>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => clearExecutionState()}
                disabled={executionLogs.length === 0}
              >
                <RotateCcw className="size-4 mr-1" />
                {t("common:actions.reset")}
              </Button>
              <Button size="sm" variant="default" onClick={handleSave} disabled={!isDirty}>
                <Save className="size-4 mr-1" />
                {t("common:actions.save")}
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
          onUpdateTrigger={updateTriggerConfig}
          availableVariables={availableVariables}
          blockSchema={selectedBlockSchema}
          className="w-80 shrink-0"
        />
      )}

      {/* Debug Panel */}
      {!readonly && (
        <DebugPanel
          workflow={workflow}
          onTest={handleTest}
          executionLogs={executionLogs}
          blockStatuses={blockStatuses}
          onBlockEvent={(event) => {
            if (event.type === "block.start") {
              setBlockStatus(event.blockId, "running");
              addExecutionLog({
                blockId: event.blockId,
                type: "start",
                message: `Starting block: ${event.blockId}`,
              });
            } else if (event.type === "block.complete") {
              setBlockStatus(event.blockId, "completed", event.output);
              addExecutionLog({
                blockId: event.blockId,
                type: "complete",
                message: `Completed: ${event.blockId}`,
                data: event.output,
              });
            } else if (event.type === "block.error") {
              setBlockStatus(event.blockId, "error", event.error);
              addExecutionLog({
                blockId: event.blockId,
                type: "error",
                message: `Error in ${event.blockId}: ${event.error}`,
              });
            }
          }}
          className="w-72 shrink-0"
        />
      )}
    </div>
  );
}

// Wrapper with ReactFlowProvider
export interface WorkflowEditorProps {
  workflow: Workflow;
  readonly?: boolean;
  onSave?: (workflow: Workflow) => Promise<void>;
  onTest?: (workflow: Workflow, payload: Record<string, unknown>) => void;
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
