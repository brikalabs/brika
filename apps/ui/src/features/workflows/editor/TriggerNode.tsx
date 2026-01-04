import { type NodeProps, Position } from '@xyflow/react';
import { Play } from 'lucide-react';
import React from 'react';
import { BaseHandle } from '@/components/base-handle';
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '@/components/base-node';
import { Badge } from '@/components/ui';

export interface TriggerNodeData {
  event: string;
  filter?: Record<string, unknown>;
}

export function TriggerNode({ data }: NodeProps<TriggerNodeData>) {
  return (
    <BaseNode className="min-w-[180px] border-green-500 border-l-4">
      <BaseNodeHeader>
        <div className="flex size-7 items-center justify-center rounded bg-green-500/20 text-green-500">
          <Play className="size-4" />
        </div>
        <BaseNodeHeaderTitle className="text-sm">Trigger</BaseNodeHeaderTitle>
      </BaseNodeHeader>

      <BaseNodeContent className="pt-0 pb-2">
        <Badge variant="outline" className="font-normal text-xs">
          on: {data.event}
        </Badge>
        {data.filter && Object.keys(data.filter).length > 0 && (
          <div className="text-muted-foreground text-xs">filter: {JSON.stringify(data.filter)}</div>
        )}
      </BaseNodeContent>

      <BaseHandle type="source" position={Position.Bottom} className="!bg-green-500" />
    </BaseNode>
  );
}
