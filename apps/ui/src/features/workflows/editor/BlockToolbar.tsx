import { useQuery } from '@tanstack/react-query';
import { GripVertical, Search } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { type DragEvent, useState } from 'react';
import { Badge, Input, ScrollArea, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

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
  inputs: Array<{ id: string; name: string; typeName?: string }>;
  outputs: Array<{ id: string; name: string; typeName?: string }>;
  schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBlocks(): Promise<BlockDefinition[]> {
  const res = await fetch('/api/blocks');
  if (!res.ok) throw new Error('Failed to fetch blocks');
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

interface DraggableBlockProps {
  block: BlockDefinition;
  onDragStart: (e: DragEvent<HTMLDivElement>, block: BlockDefinition) => void;
}

function DraggableBlock({ block, onDragStart }: DraggableBlockProps) {
  const iconName = (block.icon || 'box') as IconName;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => onDragStart(e, block)}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-lg border bg-card p-2.5',
        'transition-all hover:border-accent-foreground/20 hover:bg-accent',
        'active:scale-[0.98] active:cursor-grabbing',
        'shadow-sm hover:shadow'
      )}
    >
      <GripVertical className="size-3 text-muted-foreground/50" />
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-md shadow-sm"
        style={{ backgroundColor: block.color + '20', color: block.color }}
      >
        <DynamicIcon name={iconName} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{block.name}</div>
        <div className="truncate text-muted-foreground text-xs">{block.description}</div>
      </div>
    </div>
  );
}

function BlockSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
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
  const [search, setSearch] = useState('');

  const {
    data: blocks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['blocks'],
    queryFn: fetchBlocks,
    staleTime: 30000,
  });

  const handleDragStart = (e: React.DragEvent, block: BlockDefinition) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify(block));
    e.dataTransfer.effectAllowed = 'move';
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
  const categories = [...new Set(filteredBlocks.map((b) => b.category))].sort();
  const groupedBlocks = categories.map((cat) => ({
    id: cat,
    label: cat.charAt(0).toUpperCase() + cat.slice(1),
    blocks: filteredBlocks.filter((b) => b.category === cat),
  }));

  return (
    <div className={cn('flex h-full flex-col border-r bg-card/50 backdrop-blur-sm', className)}>
      <div className="border-b bg-background/80 p-3">
        <h3 className="mb-2 font-semibold text-foreground text-sm">Blocks</h3>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-background pl-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {isLoading ? (
            <div className="space-y-2">
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-destructive text-sm">Failed to load blocks</p>
              <p className="mt-1 text-muted-foreground text-xs">Check if the hub is running</p>
            </div>
          ) : groupedBlocks.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {search ? 'No blocks found' : 'No blocks available'}
            </div>
          ) : (
            groupedBlocks.map((category) => (
              <div key={category.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {category.label}
                  </span>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
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

      <div className="border-t bg-background/80 p-3">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
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
