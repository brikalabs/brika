/**
 * BlocksPreview Component
 *
 * Shows a preview of workflow blocks with icons.
 */

import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useLocale } from '@/lib/use-locale';

interface Block {
  id: string;
  icon?: string;
  color?: string;
}

interface BlocksPreviewProps {
  blocks: Block[] | undefined;
}

export function BlocksPreview({ blocks }: Readonly<BlocksPreviewProps>) {
  const { t } = useLocale();
  const blockCount = blocks?.length || 0;

  if (blockCount === 0) {
    return <span className="text-muted-foreground text-xs">{t('workflows:table.noBlocks')}</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {blocks?.slice(0, 3).map((block) => {
        const iconName = (block.icon || 'box') as IconName;
        const color = block.color || '#6b7280';
        return (
          <div
            key={block.id}
            className="flex size-7 items-center justify-center rounded-lg shadow-sm"
            style={{ backgroundColor: `${color}15`, color }}
            title={block.id}
          >
            <DynamicIcon name={iconName} className="size-3.5" />
          </div>
        );
      })}
      {blockCount > 3 && (
        <span className="font-medium text-muted-foreground text-xs">+{blockCount - 3}</span>
      )}
    </div>
  );
}
