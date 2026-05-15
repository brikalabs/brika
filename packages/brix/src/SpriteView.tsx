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
    const last = runs.at(-1);
    if (last && styleEq(last, c?.color, c?.dim, c?.bold)) {
      last.text += ch;
    } else {
      runs.push({ text: ch, color: c?.color, dim: c?.dim, bold: c?.bold });
    }
  }
  return runs;
}

function runKey(run: Run): string {
  return `${run.text}|${run.color ?? ''}|${run.dim ? 1 : 0}|${run.bold ? 1 : 0}`;
}

function rowKey(runs: ReadonlyArray<Run>): string {
  return runs.map(runKey).join('§');
}

/** Disambiguate identical neighbours so React doesn't warn about
 *  duplicate keys when a sprite has multiple blank rows or repeating
 *  text runs. The counter is appended after the content, so the same
 *  position always produces the same key for the same content. */
function uniqueKeys(seeds: ReadonlyArray<string>): string[] {
  const seen = new Map<string, number>();
  return seeds.map((seed) => {
    const n = seen.get(seed) ?? 0;
    seen.set(seed, n + 1);
    return n === 0 ? seed : `${seed}#${n}`;
  });
}

export function SpriteView({ sprite }: Readonly<SpriteViewProps>): React.ReactElement {
  const rows = sprite.rows.map(rowToRuns);
  const rowKeys = uniqueKeys(rows.map(rowKey));
  return (
    <Box flexDirection="column">
      {rows.map((runs, ri) => {
        const runKeys = uniqueKeys(runs.map(runKey));
        return (
          <Box key={rowKeys[ri]}>
            {runs.length === 0 ? (
              <Text> </Text>
            ) : (
              runs.map((run, i) => (
                <Text key={runKeys[i]} color={run.color} dimColor={run.dim} bold={run.bold}>
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
