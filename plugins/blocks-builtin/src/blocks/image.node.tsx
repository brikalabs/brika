/**
 * Image block node-body view.
 *
 * Renders the configured image on the canvas node. Falls back to a placeholder
 * when no URL is set.
 */

import { useBlockConfig } from '@brika/sdk/block-views';
import { ImageOff } from 'lucide-react';

interface ImageConfig {
  url?: string;
  alt?: string;
}

export default function ImageNode() {
  const config = useBlockConfig<ImageConfig>();
  const url = config.url?.trim();

  if (!url) {
    return (
      <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground">
        <ImageOff className="size-5" />
        <span className="text-[10px]">Set an image URL</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={config.alt ?? 'Block image'}
      className="max-h-40 w-full rounded-md object-cover"
    />
  );
}
