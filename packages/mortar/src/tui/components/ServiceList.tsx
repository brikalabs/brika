import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';
import type { ServiceState } from '../../supervisor';
import { statusColor, statusGlyph } from '../utils/status';

interface Props {
  readonly services: ReadonlyArray<ServiceState>;
  readonly focusedIndex: number;
}

/**
 * Column overhead = `▸ ● ` prefix (4 cells, ▸ and ● are wide CJK-class
 * glyphs counted as 2 cells each in most terminals) + `paddingX` (1
 * each side) + border (1 each side) + a 1-cell safety margin. The
 * `min/max` clamps prevent absurd widths if labels are pathological.
 */
const PREFIX_OVERHEAD = 8;
const MIN_WIDTH = 14;
const MAX_WIDTH = 40;

/**
 * Left column: one row per service with a status dot + label.
 * The box auto-sizes to fit the longest label so we don't waste
 * horizontal space when labels are short OR truncate mid-word when
 * one label is slightly longer than a fixed width.
 */
export function ServiceList({ services, focusedIndex }: Readonly<Props>): React.ReactElement {
  const width = useMemo(() => {
    let longest = 'Services'.length;
    for (const svc of services) {
      if (svc.spec.label.length > longest) {
        longest = svc.spec.label.length;
      }
    }
    const target = longest + PREFIX_OVERHEAD;
    if (target < MIN_WIDTH) {
      return MIN_WIDTH;
    }
    if (target > MAX_WIDTH) {
      return MAX_WIDTH;
    }
    return target;
  }, [services]);

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold>Services</Text>
      <Box marginTop={1} flexDirection="column">
        {services.map((svc, i) => (
          <Box key={svc.spec.id}>
            <Text color={i === focusedIndex ? 'cyan' : undefined}>
              {i === focusedIndex ? '▸ ' : '  '}
            </Text>
            <Text color={statusColor(svc.status)}>{statusGlyph(svc.status)} </Text>
            {/*
              `wrap="truncate-end"` + `flexShrink` keeps each row to a
              single line. Without it, ink reflows the wrapped portion
              back to the row's left edge — visually unaligned with the
              status dot. Only kicks in when a label exceeds MAX_WIDTH.
            */}
            <Box flexShrink={1}>
              <Text bold={i === focusedIndex} wrap="truncate-end">
                {svc.spec.label}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
