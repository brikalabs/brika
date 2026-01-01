import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, ScrollArea, Badge, Skeleton } from "@/components/ui";
import { 
  Zap, GitBranch, Shuffle, Timer, Send, Edit, FileText, Square,
  Search, GripVertical, GitMerge, GitFork, Box,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockDefinition {
  id: string;
  type?: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  inputs: Array<{ id: string; name: string; type?: string }>;
  outputs: Array<{ id: string; name: string; type?: string }>;
  schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// Icon mapping from Lucide names
const ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  "git-branch": GitBranch,
  shuffle: Shuffle,
  timer: Timer,
  send: Send,
  edit: Edit,
  "file-text": FileText,
  square: Square,
  "git-merge": GitMerge,
  "git-fork": GitFork,
};

const getIcon = (iconName: string): LucideIcon => {
  return ICON_MAP[iconName] || Box;
};

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBlocks(): Promise<BlockDefinition[]> {
  const res = await fetch("/api/blocks");
  if (!res.ok) throw new Error("Failed to fetch blocks");
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

interface DraggableBlockProps {
  block: BlockDefinition;
  onDragStart: (e: React.DragEvent, block: BlockDefinition) => void;
}

function DraggableBlock({ block, onDragStart }: DraggableBlockProps) {
  const Icon = getIcon(block.icon);
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, block)}
      className={cn(
        "flex items-center gap-2 p-2.5 rounded-lg border bg-card cursor-grab",
        "hover:bg-accent hover:border-accent-foreground/20 transition-all",
        "active:cursor-grabbing active:scale-[0.98]",
        "shadow-sm hover:shadow"
      )}
    >
      <GripVertical className="size-3 text-muted-foreground/50" />
      <div 
        className="size-8 rounded-md flex items-center justify-center shrink-0 shadow-sm"
        style={{ backgroundColor: block.color + "20", color: block.color }}
      >
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{block.name}</div>
        <div className="text-xs text-muted-foreground truncate">{block.description}</div>
      </div>
    </div>
  );
}

function BlockSkeleton() {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
      <Skeleton className="size-3" />
      <Skeleton className="size-8 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

interface BlockToolbarProps {
  onDragStart?: (e: React.DragEvent, block: BlockDefinition) => void;
  className?: string;
}

export function BlockToolbar({ onDragStart, className }: BlockToolbarProps) {
  const [search, setSearch] = useState("");
  
  const { data: blocks = [], isLoading, error } = useQuery({
    queryKey: ["blocks"],
    queryFn: fetchBlocks,
    staleTime: 30000,
  });
  
  const handleDragStart = (e: React.DragEvent, block: BlockDefinition) => {
    e.dataTransfer.setData("application/reactflow", JSON.stringify(block));
    e.dataTransfer.effectAllowed = "move";
    onDragStart?.(e, block);
  };
  
  const filteredBlocks = search
    ? blocks.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          (b.type || b.id).toLowerCase().includes(search.toLowerCase()) ||
          b.description.toLowerCase().includes(search.toLowerCase())
      )
    : blocks;
  
  // Group by category
  const categories = [...new Set(filteredBlocks.map(b => b.category))].sort();
  const groupedBlocks = categories.map(cat => ({
    id: cat,
    label: cat.charAt(0).toUpperCase() + cat.slice(1),
    blocks: filteredBlocks.filter(b => b.category === cat),
  }));
  
  return (
    <div className={cn("flex flex-col h-full bg-card/50 backdrop-blur-sm border-r", className)}>
      <div className="p-3 border-b bg-background/80">
        <h3 className="text-sm font-semibold mb-2 text-foreground">Blocks</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 bg-background"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-destructive">Failed to load blocks</p>
              <p className="text-xs text-muted-foreground mt-1">Check if the hub is running</p>
            </div>
          ) : groupedBlocks.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {search ? "No blocks found" : "No blocks available"}
            </div>
          ) : (
            groupedBlocks.map((category) => (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {category.label}
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {category.blocks.length}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {category.blocks.map((block) => (
                    <DraggableBlock
                      key={block.type || block.id}
                      block={block}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      <div className="p-3 border-t bg-background/80">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Drag to add</span>
          <Badge variant="outline" className="text-[10px]">
            {blocks.length} blocks
          </Badge>
        </div>
      </div>
    </div>
  );
}

// Extended BlockTypeInfo that includes metadata
export interface BlockTypeInfo extends BlockDefinition {
  defaultConfig?: Record<string, unknown>;
}

// Re-export for compatibility
export const BLOCK_TYPES: BlockDefinition[] = [];
