/**
 * `<SpriteView>` — paint a composed `Sprite` to the terminal.
 *
 * Each row becomes one `<Box>` containing one or more `<Text>` runs.
 * Cells with identical style are coalesced into a single `<Text>` so
 * Ink's diff has the smallest possible set of nodes to reconcile.
 * Transparent cells (`null`) render as a literal space.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { Cell, Sprite, SpriteRow } from './sprite';

export interface SpriteViewProps {
  readonly sprite: Sprite;
}

interface Run {
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
}

function styleEq(
  a: Run,
  color: string | undefined,
  dim: boolean | undefined,
  bold: boolean | undefined
): boolean {
  return (
    a.color === color &&
    (a.dim ?? false) === (dim ?? false) &&
    (a.bold ?? false) === (bold ?? false)
  );
}

function rowToRuns(row: SpriteRow): Run[] {
  const runs: Run[] = [];
  for (const cell of row) {
    const ch = cell?.ch ?? ' ';
    const c: Cell | undefined = cell ?? undefined;
    const last = runs[runs.length - 1];
    if (last && styleEq(last, c?.color, c?.dim, c?.bold)) {
      last.text += ch;
    } else {
      runs.push({ text: ch, color: c?.color, dim: c?.dim, bold: c?.bold });
    }
  }
  return runs;
}

export function SpriteView({ sprite }: Readonly<SpriteViewProps>): React.ReactElement {
  return (
    <Box flexDirection="column">
      {sprite.rows.map((row, ri) => {
        const runs = rowToRuns(row);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional grid — row at index N is always the same row
          <Box key={`row-${ri}`}>
            {runs.length === 0 ? (
              <Text> </Text>
            ) : (
              runs.map((run, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional run within row, recomputed each render
                <Text key={`run-${i}`} color={run.color} dimColor={run.dim} bold={run.bold}>
                  {run.text}
                </Text>
              ))
            )}
          </Box>
        );
      })}
    </Box>
  );
}
