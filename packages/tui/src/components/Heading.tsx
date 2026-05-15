/**
 * `<Heading>` — view / section title. Replaces the
 * `<Box marginBottom={1}><Text bold>Title</Text></Box>` pattern that
 * every view was duplicating.
 *
 *   <Heading>Plugins</Heading>
 *   <Heading subtitle="3 installed">Plugins</Heading>
 *   <Heading subtitle="filter on" level={2}>Workflows</Heading>
 *
 * `level=1` is a page-level title (bold, default color); `level=2` is
 * a section title (bold + dim, for use inside a card or a tab panel
 * that already has its own page header). One bottom margin so the
 * content under it lines up consistently across views.
 *
 * Slots:
 *   - `subtitle` — dim text rendered inline next to the title.
 *   - `meta`     — node rendered to the right of the title (count,
 *                  badge, error, …). When provided, the row uses
 *                  `flexGrow` so meta floats right.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';

export type HeadingLevel = 1 | 2;

export interface HeadingProps {
  readonly level?: HeadingLevel;
  readonly subtitle?: ReactNode;
  readonly meta?: ReactNode;
  readonly children?: ReactNode;
}

export function Heading({
  level = 1,
  subtitle,
  meta,
  children,
}: Readonly<HeadingProps>): React.ReactElement {
  const dim = level === 2;
  return (
    <Box marginBottom={1}>
      <Text bold dimColor={dim}>
        {children}
      </Text>
      {subtitle ? (
        <>
          <Text dimColor> · </Text>
          <Text dimColor>{subtitle}</Text>
        </>
      ) : null}
      {meta ? (
        <>
          <Box flexGrow={1} />
          {meta}
        </>
      ) : null}
    </Box>
  );
}
