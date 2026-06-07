/**
 * Photo brick — descriptor + view in one file.
 *
 * A photo carousel with auto-rotation. Config-only (no server-pushed data), so
 * the descriptor lives beside the view; nothing on the server imports it.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import { useBrickConfig, useBrickSize } from '@brika/sdk/brick-views';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export const photoBrick = defineBrick({
  id: 'photo',
  meta: {
    name: 'Photo',
    description: 'Photo showcase with auto-rotation',
    category: 'media',
    icon: 'image',
    color: '#8b5cf6',
  },
  config: z.object({
    autoRotate: z
      .boolean()
      .default(true)
      .meta({ label: 'Auto-rotate' })
      .describe('Automatically cycle through photos'),
    interval: z
      .number()
      .min(1000)
      .max(60000)
      .multipleOf(1000)
      .default(8000)
      .meta({ label: 'Interval (ms)' })
      .describe('Time between photo changes'),
  }),
  data: z.object({}),
});

const PHOTOS = [
  { src: 'https://picsum.photos/seed/brika1/800/600', caption: 'Mountain sunrise' },
  { src: 'https://picsum.photos/seed/brika2/800/600', caption: 'Ocean waves' },
  { src: 'https://picsum.photos/seed/brika3/800/600', caption: 'Forest trail' },
  { src: 'https://picsum.photos/seed/brika4/800/600', caption: 'City skyline' },
];

export default function PhotoBrick() {
  const { width, height } = useBrickSize();
  const { autoRotate, interval } = useBrickConfig(photoBrick.config);

  const [index, setIndex] = useState(0);
  const photo = PHOTOS[index % PHOTOS.length];
  const counter = `${(index % PHOTOS.length) + 1}/${PHOTOS.length}`;

  const handleNext = useCallback(() => {
    setIndex((i) => (i + 1) % PHOTOS.length);
  }, []);

  const handlePrev = useCallback(() => {
    setIndex((i) => (i - 1 + PHOTOS.length) % PHOTOS.length);
  }, []);

  useEffect(() => {
    if (!autoRotate) {
      return;
    }
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % PHOTOS.length);
    }, interval);
    return () => clearInterval(id);
  }, [autoRotate, interval]);

  return (
    <button
      type="button"
      className="relative flex h-full w-full flex-col overflow-hidden rounded-lg"
      style={{
        backgroundImage: `url(${photo.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      onClick={handleNext}
    >
      {/* Gradient overlay at bottom */}
      <div className="mt-auto flex items-center justify-between gap-2 bg-black/50 px-3 py-2 backdrop-blur-sm">
        <span className="truncate font-medium text-white text-xs">{photo.caption}</span>

        {width > 2 && height > 2 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] text-white/70 tabular-nums">{counter}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="flex size-6 cursor-pointer items-center justify-center rounded text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="flex size-6 cursor-pointer items-center justify-center rounded text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </button>
  );
}
