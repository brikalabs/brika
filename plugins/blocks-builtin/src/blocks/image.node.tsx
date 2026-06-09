/**
 * Image block node-body view.
 *
 * Renders whatever media reaches the block: the live input/output value (URL
 * string, data URL, raw bytes, or a { url, bytes, mimeType } envelope) or the
 * configured URL. The last successfully shown media is KEPT until new media
 * arrives, so a re-run or transient empty value never blanks the node.
 */

import { useBlockConfig, useBlockData } from '@brika/sdk/block-views';
import { bytesToDataUrl, normalizeMedia } from '@brika/sdk/media';
import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ImageConfig {
  url?: string;
  alt?: string;
}

/** Renderable src for any media shape; null when there is nothing to show. */
function mediaSrc(value: unknown): string | null {
  const media = normalizeMedia(value);
  if (!media) {
    return null;
  }
  if (media.url) {
    return media.url;
  }
  if (media.bytes) {
    return bytesToDataUrl(media.bytes, media.mimeType);
  }
  return null;
}

export default function ImageNode() {
  const config = useBlockConfig<ImageConfig>();
  const data = useBlockData<unknown>();

  // Keep the last good media: ignore empty/non-media updates.
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const next = mediaSrc(data) ?? mediaSrc(config.url?.trim());
    if (next) {
      setSrc(next);
    }
  }, [data, config.url]);

  if (!src) {
    return (
      <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground">
        <ImageOff className="size-5" />
        <span className="text-[10px]">Wire media in or set an image URL</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={config.alt ?? 'Block image'}
      className="max-h-40 w-full rounded-md object-cover"
    />
  );
}
