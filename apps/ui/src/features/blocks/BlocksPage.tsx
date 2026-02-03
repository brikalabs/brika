/**
 * Blocks Page
 *
 * Grid view of all available block types for building workflows.
 */

import { Search } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import { Avatar, AvatarFallback, Badge, Card, Input } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { BlockDefinition } from '../workflows/api';
import { useBlockTypes } from '../workflows/hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Block Card
// ─────────────────────────────────────────────────────────────────────────────

function BlockCard({ block }: Readonly<{ block: BlockDefinition }>) {
  const { tp } = useLocale();
  const iconName = (block.icon || 'box') as IconName;
  const color = block.color || 'var(--primary)';
  const blockKey = block.id.split(':').pop() || block.id;
  const blockName = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
  const blockDesc = tp(block.pluginId, `blocks.${blockKey}.description`, block.description);

  return (
    <Card interactive className="h-full p-5">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <Avatar className="size-10" style={{ backgroundColor: `${color}20`, color }}>
            <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
              <DynamicIcon name={iconName} className="size-5" />
            </AvatarFallback>
          </Avatar>
          {block.category && (
            <Badge variant="secondary" className="text-[10px] uppercase">
              {block.category}
            </Badge>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <h3 className="font-semibold text-sm leading-tight transition-colors group-hover:text-foreground">
            {blockName}
          </h3>
          {blockDesc && (
            <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
              {blockDesc}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function BlocksPage() {
  const { t, tp } = useLocale();
  const { data: blockTypes = [], isLoading } = useBlockTypes();
  const [search, setSearch] = useState('');

  // Group blocks by category
  const categories = blockTypes.reduce(
    (acc, block) => {
      const cat = block.category || 'other';
      acc[cat] ??= [];
      acc[cat].push(block);
      return acc;
    },
    {} as Record<string, BlockDefinition[]>
  );

  // Filter blocks by search - using translated values
  const filteredCategories = Object.entries(categories).reduce(
    (acc, [cat, blocks]) => {
      const filtered = blocks.filter((b) => {
        if (!search) return true;

        const searchLower = search.toLowerCase();
        const blockKey = b.id.split(':').pop() || b.id;
        const blockName = tp(b.pluginId, `blocks.${blockKey}.name`, b.name || blockKey);
        const blockDesc = tp(b.pluginId, `blocks.${blockKey}.description`, b.description);

        return (
          blockName.toLowerCase().includes(searchLower) ||
          blockDesc?.toLowerCase().includes(searchLower) ||
          b.id.toLowerCase().includes(searchLower) ||
          b.category?.toLowerCase().includes(searchLower)
        );
      });
      if (filtered.length > 0) acc[cat] = filtered;
      return acc;
    },
    {} as Record<string, BlockDefinition[]>
  );

  const totalFiltered = Object.values(filteredCategories).flat().length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">{t('blocks:title')}</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('blocks:subtitle')}
            {!isLoading && (
              <span className="ml-2 font-medium">
                · {totalFiltered} {totalFiltered === 1 ? 'block' : 'blocks'}
              </span>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('blocks:search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 shadow-sm"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="py-16 text-center text-muted-foreground">{t('common:loading')}</div>
      )}
      {!isLoading && totalFiltered === 0 && (
        <Card className="border-dashed p-16 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
            <Search className="size-8 text-muted-foreground opacity-50" />
          </div>
          <h3 className="font-semibold text-base">
            {search ? t('blocks:noResults') : t('blocks:empty')}
          </h3>
          {search && (
            <p className="mt-2 text-muted-foreground text-sm">
              Try searching with different keywords
            </p>
          )}
        </Card>
      )}
      {!isLoading && totalFiltered > 0 && (
        <div className="space-y-10">
          {Object.entries(filteredCategories).map(([category, blocks]) => (
            <div key={category}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="font-semibold text-xl capitalize tracking-tight">{category}</h2>
                <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                  {blocks.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {blocks.map((block) => (
                  <BlockCard key={block.id} block={block} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
