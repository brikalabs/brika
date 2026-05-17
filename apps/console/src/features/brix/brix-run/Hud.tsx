/** Heads-up display + key-hint footer. Pure presentational. */

import { Box, Text } from 'ink';
import type React from 'react';
import { INITIAL_SCROLL, MAX_SCROLL } from './constants';

const SPEED_SLOTS = 8;

function speedBar(scrollSpeed: number): string {
  const range = MAX_SCROLL - INITIAL_SCROLL;
  const ratio = range > 0 ? (scrollSpeed - INITIAL_SCROLL) / range : 0;
  const f = Math.max(0, Math.min(SPEED_SLOTS, Math.round(ratio * SPEED_SLOTS)));
  return '▓'.repeat(f) + '░'.repeat(SPEED_SLOTS - f);
}

const pad4 = (n: number): string => n.toString().padStart(4, '0');

const TITLE_RULE = '━'.repeat(33);

export function Title(): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan">{TITLE_RULE}</Text>
      <Box>
        <Text color="yellow" bold>
          {' '}
          ✦{' '}
        </Text>
        <Text color="cyanBright" bold>
          B R I X R U N
        </Text>
        <Text color="yellow" bold>
          {' '}
          ✦
        </Text>
        <Text dimColor> survive the bricks</Text>
      </Box>
      <Text color="cyan">{TITLE_RULE}</Text>
    </Box>
  );
}

function HudCard({
  label,
  color,
  children,
}: Readonly<{ label: string; color: string; children: React.ReactNode }>): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1}>
      <Text color={color} bold>
        {label}{' '}
      </Text>
      {children}
    </Box>
  );
}

export function Hud({
  score,
  best,
  scrollSpeed,
}: Readonly<{ score: number; best: number; scrollSpeed: number }>): React.ReactElement {
  return (
    <Box marginBottom={1} gap={1}>
      <HudCard label="SCORE" color="yellow">
        <Text bold color="yellowBright">
          {pad4(score)}
        </Text>
      </HudCard>
      <HudCard label="BEST" color="cyan">
        <Text bold color="cyanBright">
          {pad4(best)}
        </Text>
      </HudCard>
      <HudCard label="SPEED" color="green">
        <Text color="greenBright">{speedBar(scrollSpeed)}</Text>
        <Text dimColor> {scrollSpeed.toFixed(1)}</Text>
      </HudCard>
    </Box>
  );
}

const HINTS: ReadonlyArray<readonly [string, string]> = [
  ['SPACE / ↑', 'jump'],
  ['↓ / S', 'duck'],
  ['← →', 'move'],
  ['P', 'pause'],
  ['R', 'reset'],
];

export function KeyHints(): React.ReactElement {
  return (
    <Box marginTop={1} gap={2} flexWrap="wrap">
      {HINTS.map(([label, desc]) => (
        <Box key={label}>
          <Text color="yellow" bold>
            ⟦
          </Text>
          <Text bold color="white">
            {label}
          </Text>
          <Text color="yellow" bold>
            ⟧
          </Text>
          <Text dimColor> {desc}</Text>
        </Box>
      ))}
    </Box>
  );
}
