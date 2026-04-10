import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Search,
  X,
} from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { type DragEvent, useMemo, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  ScrollArea,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLocale } from '@/lib/use-locale';
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
  pluginId: string;
  inputs: Array<{
    id: string;
    name: string;
    typeName?: string;
    type?: Record<string, unknown>;
  }>;
  outputs: Array<{
    id: string;
    name: string;
    typeName?: string;
    type?: Record<string, unknown>;
  }>;
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
  if (!res.ok) {
    throw new Error('Failed to fetch blocks');
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

interface DraggableBlockProps {
  block: BlockDefinition;
  onDragStart: (e: DragEvent<Element>, block: BlockDefinition, translatedLabel: string) => void;
}

function DraggableBlock({ block, onDragStart }: Readonly<DraggableBlockProps>) {
  const { tp } = useLocale();
  const iconName = (block.icon || 'box') as IconName;

  // Translate block name and description
  const blockKey = block.id.split(':').pop() || block.id;
  const blockName = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
  const blockDesc = tp(block.pluginId, `blocks.${blockKey}.description`, block.description);

  const hasInputs = block.inputs && block.inputs.length > 0;
  const hasOutputs = block.outputs && block.outputs.length > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          draggable
          onDragStart={(e) => onDragStart(e, block, blockName)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.currentTarget.dispatchEvent(
                new DragEvent('dragstart', {
                  bubbles: true,
                })
              );
            }
          }}
          className={cn(
            'group flex cursor-grab items-center gap-2 rounded-lg border bg-card p-2.5',
            'transition-all hover:border-accent-foreground/20 hover:bg-accent',
            'active:scale-[0.98] active:cursor-grabbing',
            'shadow-sm hover:shadow',
            'w-full text-left'
          )}
        >
          <GripVertical className="size-3 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
          <Avatar
            className="size-8"
            style={{
              backgroundColor: block.color,
            }}
          >
            <AvatarFallback
              style={{
                backgroundColor: block.color,
              }}
            >
              <DynamicIcon name={iconName} className="size-4 text-white" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">{blockName}</div>
            <div className="flex items-center gap-1 text-xs">
              {hasInputs && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
                  <ArrowDownToLine className="size-2.5" />
                  {block.inputs.length}
                </span>
              )}
              {hasOutputs && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-600 dark:text-orange-400">
                  <ArrowUpFromLine className="size-2.5" />
                  {block.outputs.length}
                </span>
              )}
              {!hasInputs && !hasOutputs && (
                <span className="truncate text-muted-foreground">{blockDesc}</span>
              )}
            </div>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="w-64 p-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Avatar
            className="size-8"
            style={{
              backgroundColor: block.color,
            }}
          >
            <AvatarFallback
              style={{
                backgroundColor: block.color,
              }}
            >
              <DynamicIcon name={iconName} className="size-4 text-white" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold">{blockName}</p>
            <p className="text-[10px] opacity-60">{block.category}</p>
          </div>
        </div>

        {/* Description */}
        {blockDesc && <p className="mt-2 text-[11px] opacity-80">{blockDesc}</p>}

        {/* I/O Section */}
        {(hasInputs || hasOutputs) && (
          <div className="mt-3 space-y-2">
            {/* Inputs */}
            {hasInputs && (
              <div className="flex flex-wrap gap-1">
                {block.inputs.slice(0, 6).map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400"
                  >
                    <ArrowDownToLine className="size-2.5" />
                    {p.name}
                  </span>
                ))}
                {block.inputs.length > 6 && (
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500">
                    +{block.inputs.length - 6}
                  </span>
                )}
              </div>
            )}

            {/* Outputs */}
            {hasOutputs && (
              <div className="flex flex-wrap gap-1">
                {block.outputs.slice(0, 6).map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-600 dark:text-orange-400"
                  >
                    <ArrowUpFromLine className="size-2.5" />
                    {p.name}
                  </span>
                ))}
                {block.outputs.length > 6 && (
                  <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-500">
                    +{block.outputs.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
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
  onDragStart?: (e: DragEvent, block: BlockDefinition) => void;
  onCollapse?: () => void;
  className?: string;
}

export function BlockToolbar({ onDragStart, onCollapse, className }: Readonly<BlockToolbarProps>) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const {
    data: blocks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['blocks'],
    queryFn: fetchBlocks,
    staleTime: 30000,
  });

  const handleDragStart = (e: DragEvent, block: BlockDefinition, translatedLabel: string) => {
    // Include the translated label in the drag data
    const dragData = {
      ...block,
      translatedLabel,
    };
    e.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e, block);
  };

  const filteredBlocks = useMemo(() => {
    if (!search) return blocks;
    const lowerSearch = search.toLowerCase();
    return blocks.filter(
      (b) =>
        b.name.toLowerCase().includes(lowerSearch) ||
        (b.type || b.id).toLowerCase().includes(lowerSearch) ||
        b.description.toLowerCase().includes(lowerSearch)
    );
  }, [search, blocks]);

  // Group by category
  const groupedBlocks = useMemo(() => {
    const categories = [...new Set(filteredBlocks.map((b) => b.category))].sort((a, b) =>
      a.localeCompare(b)
    );
    return categories.map((cat) => ({
      id: cat,
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      blocks: filteredBlocks.filter((b) => b.category === cat),
    }));
  }, [filteredBlocks]);

  return (
    <div className={cn('flex h-full flex-col border-r bg-card/50 backdrop-blur-sm', className)}>
      <div className="border-b bg-background/80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">
            {t('workflows:editor.panels.blocks')}
          </h3>
          {onCollapse && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={onCollapse}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t('workflows:editor.panels.collapse')}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder={t('workflows:editor.panels.searchBlocks')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn('h-9 bg-background pl-8', search && 'pr-8')}
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="space-y-4 p-3">
          {isLoading && (
            <div className="space-y-2">
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
            </div>
          )}
          {!isLoading && error && (
            <div className="py-8 text-center">
              <p className="text-destructive text-sm">Failed to load blocks</p>
              <p className="mt-1 text-muted-foreground text-xs">Check if the hub is running</p>
            </div>
          )}
          {!isLoading && !error && groupedBlocks.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {search
                ? t('workflows:editor.panels.noBlocksFound')
                : t('workflows:editor.panels.noBlocks')}
            </div>
          )}
          {!isLoading && !error && groupedBlocks.length > 0 && (
            <>
              {groupedBlocks.map((category) => {
                const isOpen = openCategories[category.id] ?? true;
                return (
                  <Collapsible
                    key={category.id}
                    open={isOpen}
                    onOpenChange={(open) =>
                      setOpenCategories((prev) => ({
                        ...prev,
                        [category.id]: open,
                      }))
                    }
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
                      >
                        <ChevronRight
                          className={cn(
                            'size-3.5 text-muted-foreground transition-transform',
                            isOpen && 'rotate-90'
                          )}
                        />
                        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          {category.label}
                        </span>
                        <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
                          {category.blocks.length}
                        </Badge>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1.5">
                      {category.blocks.map((block) => (
                        <DraggableBlock
                          key={block.type || block.id}
                          block={block}
                          onDragStart={handleDragStart}
                        />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="border-t bg-background/80 p-3">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>{t('workflows:editor.panels.dragToAdd')}</span>
          <Badge variant="outline" className="text-[10px]">
            {blocks.length} {t('workflows:editor.panels.blocks').toLowerCase()}
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
