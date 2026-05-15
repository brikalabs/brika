/**
 * `<Stack>` — flex container with responsive direction / gap / align.
 *
 *   <Stack direction={{ base: 'column', md: 'row' }} gap={1}>
 *     <HubTile />
 *     <PluginsTile />
 *     <WorkflowsTile />
 *   </Stack>
 *
 *   →  at <80 cols: cards pile vertically
 *   →  at ≥80 cols: cards tile horizontally
 *
 * Every prop accepts either a plain value or a Tailwind-style
 * breakpoint map (`{ base, sm, md, lg, xl }`). Resolution happens via
 * `useBreakpoint` so the layout reflows on terminal resize.
 *
 * For non-responsive cases this is just sugar over `<Box>` — same
 * semantics, just a clearer name when the intent is "stack things in
 * one axis".
 */

import { Box } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';
import { type Responsive, useResponsiveValue } from '../state/useBreakpoint';

export type StackDirection = 'row' | 'column';
export type StackAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch';
export type StackJustify =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export interface StackProps {
  readonly direction?: Responsive<StackDirection>;
  readonly gap?: Responsive<number>;
  readonly align?: Responsive<StackAlign>;
  readonly justify?: Responsive<StackJustify>;
  /** Wrap the stack if children overflow (only meaningful for `row`). */
  readonly wrap?: Responsive<'wrap' | 'nowrap'>;
  /** Grow to fill the parent's main axis. */
  readonly grow?: boolean;
  readonly children?: ReactNode;
}

export function Stack({
  direction,
  gap,
  align,
  justify,
  wrap,
  grow = false,
  children,
}: Readonly<StackProps>): React.ReactElement {
  const flexDirection = useResponsiveValue(direction ?? 'row', 'row');
  const flexGap = useResponsiveValue(gap ?? 0, 0);
  const alignItems = useResponsiveValue(align ?? 'stretch', 'stretch');
  const justifyContent = useResponsiveValue(justify ?? 'flex-start', 'flex-start');
  const flexWrap = useResponsiveValue(wrap ?? 'nowrap', 'nowrap');

  return (
    <Box
      flexDirection={flexDirection}
      gap={flexGap}
      alignItems={alignItems}
      justifyContent={justifyContent}
      flexWrap={flexWrap}
      flexGrow={grow ? 1 : 0}
    >
      {children}
    </Box>
  );
}
