/**
 * Photo brick — client-side rendered.
 *
 * A photo carousel with auto-rotation. All state is local —
 * no server data push needed. Uses hardcoded picsum.photos URLs.
 */

import { useBrickConfig, useBrickSize } from '@brika/sdk/brick-views';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const PHOTOS = [
  { src: 'https://picsum.photos/seed/brika1/800/600', caption: 'Mountain sunrise' },
  { src: 'https://picsum.photos/seed/brika2/800/600', caption: 'Ocean waves' },
  { src: 'https://picsum.photos/seed/brika3/800/600', caption: 'Forest trail' },
  { src: 'https://picsum.photos/seed/brika4/800/600', caption: 'City skyline' },
];

export default function PhotoBrick() {
  const { width, height } = useBrickSize();
  const config = useBrickConfig();

  const autoRotate = typeof config.autoRotate === 'boolean' ? config.autoRotate : true;
  const interval = typeof config.interval === 'number' ? config.interval : 8000;

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
    if (!autoRotate) return;
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
        <span className="truncate text-xs font-medium text-white">{photo.caption}</span>

        {width > 2 && height > 2 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-white/70">{counter}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePrev(); }}
              className="flex size-6 cursor-pointer items-center justify-center rounded text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
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
