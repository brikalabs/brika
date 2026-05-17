/**
 * `<TerminalTooSmall>` — centered "please resize" screen for when the
 * terminal is below the app's minimum supported viewport.
 *
 *       ⚠  terminal too small
 *
 *       need   80 × 24
 *       got    52 × 16
 *
 *       try resizing or zooming out.
 *
 * Designed to be paint-cheap: nothing here measures or animates, just
 * a few `<Text>` rows in a centered Box. Dimensions update on resize
 * via the parent `useTerminalSize()`, so as soon as the user pulls
 * the window wide enough the main UI takes over.
 *
 * Both axes are rendered red/yellow when they don't meet the minimum
 * so the user can see exactly which dimension is the blocker.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';
import { useTerminalSize } from '../state/useTerminalSize';

export interface TerminalTooSmallProps {
  /** Minimum supported width in cols. */
  readonly minColumns: number;
  /** Minimum supported height in rows. */
  readonly minRows: number;
  /** Override the default headline (e.g. localised). */
  readonly message?: string;
  /** Mascot node rendered above the headline. Pass a `<BrixStage>` from
   *  `@brika/brix` for the branded mascot, or omit for the inline ASCII
   *  fallback that keeps this primitive in `@brika/tui` without taking a
   *  dep on `@brika/brix`. */
  readonly mascot?: ReactNode;
}

export function TerminalTooSmall({
  minColumns,
  minRows,
  message = 'terminal too small',
  mascot,
}: Readonly<TerminalTooSmallProps>): React.ReactElement {
  const { columns, rows } = useTerminalSize();
  const widthOk = columns >= minColumns;
  const heightOk = rows >= minRows;

  return (
    <Box width={columns} height={Math.max(3, rows - 1)} alignItems="center" justifyContent="center">
      <Box flexDirection="column" alignItems="center">
        {mascot ? <Box marginBottom={1}>{mascot}</Box> : null}
        <Box>
          <Text color="yellow" bold>
            ⚠ {message}
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column" alignItems="flex-start">
          <Dimensions
            label="need"
            columns={minColumns}
            rows={minRows}
            columnsTint="cyan"
            rowsTint="cyan"
          />
          <Dimensions
            label="got "
            columns={columns}
            rows={rows}
            columnsTint={widthOk ? 'green' : 'red'}
            rowsTint={heightOk ? 'green' : 'red'}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>try resizing or zooming out.</Text>
        </Box>
      </Box>
    </Box>
  );
}

interface DimensionsProps {
  readonly label: string;
  readonly columns: number;
  readonly rows: number;
  readonly columnsTint: string;
  readonly rowsTint: string;
}

function Dimensions({
  label,
  columns,
  rows,
  columnsTint,
  rowsTint,
}: Readonly<DimensionsProps>): React.ReactElement {
  return (
    <Box>
      <Text dimColor>{`${label}  `}</Text>
      <Text color={columnsTint} bold>
        {columns}
      </Text>
      <Text dimColor> × </Text>
      <Text color={rowsTint} bold>
        {rows}
      </Text>
    </Box>
  );
}
