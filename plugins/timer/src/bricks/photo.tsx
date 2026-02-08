import { defineBrick, useBrickSize, useEffect, usePreference, useState } from '@brika/sdk/bricks/core';
import { Button, Image, Stack, Text } from '@brika/sdk/bricks/components';

const PHOTOS = [
  { src: 'https://picsum.photos/seed/brika1/800/600', caption: 'Mountain sunrise' },
  { src: 'https://picsum.photos/seed/brika2/800/600', caption: 'Ocean waves' },
  { src: 'https://picsum.photos/seed/brika3/800/600', caption: 'Forest trail' },
  { src: 'https://picsum.photos/seed/brika4/800/600', caption: 'City skyline' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function PhotoControls({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <Stack direction="horizontal" gap="sm">
      <Button label="Previous" onPress={onPrev} icon="chevron-left" variant="outline" />
      <Button label="Next" onPress={onNext} icon="chevron-right" variant="outline" />
    </Stack>
  );
}

// ─── Brick ───────────────────────────────────────────────────────────────────

export const photoBrick = defineBrick(
  {
    id: 'photo',
    name: 'Photo',
    description: 'Photo showcase with auto-rotation',
    icon: 'image',
    color: '#8b5cf6',
    families: ['sm', 'md', 'lg'],
    category: 'media',
    minSize: { w: 1, h: 1 },
    maxSize: { w: 12, h: 8 },
    config: [
      { type: 'checkbox', name: 'autoRotate', label: 'Auto-rotate', description: 'Automatically cycle through photos', default: true },
      { type: 'number', name: 'interval', label: 'Interval (ms)', description: 'Time between photo changes', default: 8000, min: 1000, max: 60000, step: 1000 },
    ],
  },
  () => {
    const { width, height } = useBrickSize();
    const [autoRotate] = usePreference<boolean>('autoRotate', true);
    const [interval] = usePreference<number>('interval', 8000);

    const [index, setIndex] = useState(0);
    const photo = PHOTOS[index % PHOTOS.length];

    const handleNext = () => setIndex((i: number) => (i + 1) % PHOTOS.length);
    const handlePrev = () => setIndex((i: number) => (i - 1 + PHOTOS.length) % PHOTOS.length);

    useEffect(() => {
      if (!autoRotate) return;
      const id = setInterval(() => {
        setIndex((i: number) => (i + 1) % PHOTOS.length);
      }, interval);
      return () => clearInterval(id);
    }, []);

    // ── Narrow (1-2 cols): image only ────────────────────────────────────
    if (width <= 2) {
      return (
        <>
          <Image src={photo.src} rounded aspectRatio="1/1" fit="cover" />
          {height >= 3 && <Text variant="caption" content={photo.caption} />}
        </>
      );
    }

    // ── Medium+ (3+ cols): image with caption + controls ─────────────────
    const aspectRatio = width >= 5 ? '16/9' : '4/3';

    return (
      <>
        <Image src={photo.src} rounded aspectRatio={aspectRatio} fit="cover" caption={photo.caption} />
        {height >= 3 && <PhotoControls onPrev={handlePrev} onNext={handleNext} />}
      </>
    );
  },
);
