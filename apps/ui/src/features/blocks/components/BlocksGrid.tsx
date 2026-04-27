import { Badge } from '@brika/clay';
import type { Plugin } from '@brika/plugin';
import type { BlockDefinition } from '../../workflows/api';
import { BlockCard } from './BlockCard';

interface BlocksGridProps {
  categories: Record<string, BlockDefinition[]>;
  getPlugin: (id: string) => Plugin | undefined;
}

export function BlocksGrid({ categories, getPlugin }: Readonly<BlocksGridProps>) {
  return (
    <div className="space-y-10">
      {Object.entries(categories).map(([category, blocks]) => (
        <div key={category}>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="font-semibold text-xl capitalize tracking-tight">{category}</h2>
            <Badge variant="secondary" className="px-2 py-0.5 text-xs">
              {blocks.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {blocks.map((block) => (
              <BlockCard key={block.id} block={block} plugin={getPlugin(block.pluginId)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
