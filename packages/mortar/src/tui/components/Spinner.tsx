/**
 * Animated terminal spinner. Cycles through a frame set on a fixed
 * interval and renders one cell. Designed to be drop-in:
 *
 *   <Spinner />                       // braille, yellow, 80ms
 *   <Spinner kind="line" color="cyan" />
 *
 * Each animation frame is one character so consumers can place the
 * spinner inline next to text without breaking alignment.
 */

import { Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';

export type SpinnerKind = 'braille' | 'line' | 'dots' | 'arc';

const FRAMES: Readonly<Record<SpinnerKind, ReadonlyArray<string>>> = {
  braille: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  dots: ['.', '..', '...'],
  arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
};

const DEFAULT_INTERVAL_MS = 80;

export interface SpinnerProps {
  readonly kind?: SpinnerKind;
  readonly color?: string;
  readonly intervalMs?: number;
}

export function Spinner({
  kind = 'braille',
  color = 'yellow',
  intervalMs = DEFAULT_INTERVAL_MS,
}: Readonly<SpinnerProps> = {}): React.ReactElement {
  const frames = FRAMES[kind];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((n) => (n + 1) % frames.length), intervalMs);
    return () => clearInterval(t);
  }, [frames.length, intervalMs]);
  return <Text color={color}>{frames[frame]}</Text>;
}
