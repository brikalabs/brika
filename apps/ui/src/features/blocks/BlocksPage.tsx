/**
 * Blocks Page
 *
 * Grid view of all available block types for building workflows.
 */

import { Search } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useState } from 'react';
import { Badge, Card, Input } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { BlockType } from '../workflows/api';
import { useBlockTypes } from '../workflows/hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Block Card
// ─────────────────────────────────────────────────────────────────────────────

function BlockCard({ block }: { block: BlockType }) {
  const { tp } = useLocale();
  const iconName = (block.icon || 'box') as IconName;
  const color = block.color || '#6366f1';
  const blockKey = block.id.split(':').pop() || block.id;
  const blockName = tp(block.pluginId, `blocks.${blockKey}.name`, block.name || blockKey);
  const blockDesc = tp(block.pluginId, `blocks.${blockKey}.description`, block.description);

  return (
    <Card className="p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <DynamicIcon name={iconName} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{blockName}</div>
          {blockDesc && (
            <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">{blockDesc}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {block.category && (
              <Badge variant="outline" className="text-xs">
                {block.category}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {block.pluginId}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function BlocksPage() {
  const { t } = useLocale();
  const { data: blockTypes = [], isLoading } = useBlockTypes();
  const [search, setSearch] = useState('');

  // Group blocks by category
  const categories = blockTypes.reduce(
    (acc, block) => {
      const cat = block.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(block);
      return acc;
    },
    {} as Record<string, BlockType[]>
  );

  // Filter blocks by search
  const filteredCategories = Object.entries(categories).reduce(
    (acc, [cat, blocks]) => {
      const filtered = blocks.filter(
        (b) =>
          !search ||
          b.name?.toLowerCase().includes(search.toLowerCase()) ||
          b.id.toLowerCase().includes(search.toLowerCase()) ||
          b.description?.toLowerCase().includes(search.toLowerCase())
      );
      if (filtered.length > 0) acc[cat] = filtered;
      return acc;
    },
    {} as Record<string, BlockType[]>
  );

  const totalFiltered = Object.values(filteredCategories).flat().length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">{t('blocks:title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('blocks:subtitle')}</p>
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('blocks:search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{t('common:loading')}</div>
      ) : totalFiltered === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {search ? t('blocks:noResults') : t('blocks:empty')}
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(filteredCategories).map(([category, blocks]) => (
            <div key={category}>
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-lg capitalize">
                {category}
                <Badge variant="secondary" className="text-xs">
                  {blocks.length}
                </Badge>
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
