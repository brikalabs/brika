import { Box, Button, Column, Row, Text } from '@brika/sdk/bricks/components';
import { defineBrick, useBrickSize, useEffect, usePreference, useState } from '@brika/sdk/bricks/core';

const PHOTOS = [
  { src: 'https://picsum.photos/seed/brika1/800/600', caption: 'Mountain sunrise' },
  { src: 'https://picsum.photos/seed/brika2/800/600', caption: 'Ocean waves' },
  { src: 'https://picsum.photos/seed/brika3/800/600', caption: 'Forest trail' },
  { src: 'https://picsum.photos/seed/brika4/800/600', caption: 'City skyline' },
];

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
    const counter = `${(index % PHOTOS.length) + 1}/${PHOTOS.length}`;

    const handleNext = () => setIndex((i: number) => (i + 1) % PHOTOS.length);
    const handlePrev = () => setIndex((i: number) => (i - 1 + PHOTOS.length) % PHOTOS.length);

    useEffect(() => {
      if (!autoRotate) return;
      const id = setInterval(() => {
        setIndex((i: number) => (i + 1) % PHOTOS.length);
      }, interval);
      return () => clearInterval(id);
    }, []);

    // Full-bleed photo with compact overlay at bottom
    return (
      <Box backgroundImage={photo.src} backgroundFit="cover" rounded="md" grow onPress={handleNext}>
        <Column justify="end" grow>
          <Box background="rgba(0,0,0,0.5)" blur="sm" padding="sm" rounded="sm">
            <Row justify="between" align="center" gap="sm">
              <Text variant="caption" content={photo.caption} color="#fff" />
              {width > 2 && height > 2 && (
                <Row gap="sm" align="center">
                  <Text variant="caption" content={counter} color="rgba(255,255,255,0.7)" />
                  <Button onPress={handlePrev} icon="chevron-left" variant="ghost" color="#fff" />
                  <Button onPress={handleNext} icon="chevron-right" variant="ghost" color="#fff" />
                </Row>
              )}
            </Row>
          </Box>
        </Column>
      </Box>
    );
  },
);
