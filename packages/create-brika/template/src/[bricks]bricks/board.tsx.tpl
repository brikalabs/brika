/**
 * {{pascal}} Board Brick
 */

import { defineBrick, useBrickSize, useState, useEffect, Grid, Section, Stat, Stack, Toggle } from '@brika/sdk/bricks';

export const {{camel}}Brick = defineBrick(
  {
    id: '{{id}}',
    name: '{{pascal}}',
    families: ['sm', 'md', 'lg'],
  },
  () => {
    const { width } = useBrickSize();
    const [active, setActive] = useState(true);
    const [value, setValue] = useState(0);

    useEffect(() => {
      if (!active) return;
      const id = setInterval(() => setValue((v) => v + 1), 1000);
      return () => clearInterval(id);
    }, []);

    // Small (1-2 cols)
    if (width <= 2) {
      return <Stat label="Count" value={value} icon="hash" />;
    }

    // Medium (3-4 cols)
    if (width <= 4) {
      return (
        <>
          <Stat label="Count" value={value} icon="hash" color="#3b82f6" />
          <Toggle
            label="Active"
            checked={active}
            onToggle={(p) => setActive(typeof p?.checked === 'boolean' ? p.checked : !active)}
          />
        </>
      );
    }

    // Large (5+ cols)
    return (
      <Section title="{{pascal}}">
        <Grid columns={2} gap="sm">
          <Stat label="Count" value={value} icon="hash" color="#3b82f6" />
          <Stat label="Status" value={active ? 'Running' : 'Paused'} icon="activity" />
        </Grid>
        <Stack direction="horizontal" gap="sm">
          <Toggle
            label="Active"
            checked={active}
            onToggle={(p) => setActive(typeof p?.checked === 'boolean' ? p.checked : !active)}
            icon="power"
          />
        </Stack>
      </Section>
    );
  },
);
