import React from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle, BaseNodeContent } from "@/components/base-node";
import { BaseHandle } from "@/components/base-handle";
import { Badge } from "@/components/ui";
import { Play } from "lucide-react";

export interface TriggerNodeData {
  event: string;
  filter?: Record<string, unknown>;
}

export function TriggerNode({ data }: NodeProps<TriggerNodeData>) {
  return (
    <BaseNode className="min-w-[180px] border-green-500 border-l-4">
      <BaseNodeHeader>
        <div className="size-7 rounded flex items-center justify-center bg-green-500/20 text-green-500">
          <Play className="size-4" />
        </div>
        <BaseNodeHeaderTitle className="text-sm">Trigger</BaseNodeHeaderTitle>
      </BaseNodeHeader>

      <BaseNodeContent className="pt-0 pb-2">
        <Badge variant="outline" className="text-xs font-normal">
          on: {data.event}
        </Badge>
        {data.filter && Object.keys(data.filter).length > 0 && (
          <div className="text-xs text-muted-foreground">filter: {JSON.stringify(data.filter)}</div>
        )}
      </BaseNodeContent>

      <BaseHandle type="source" position={Position.Bottom} className="!bg-green-500" />
    </BaseNode>
  );
}

