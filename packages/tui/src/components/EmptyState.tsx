/**
 * `<EmptyState>` — the dim "(no X yet)" block every list view needs.
 *
 *   <EmptyState>
 *     <EmptyStateTitle>No plugins yet</EmptyStateTitle>
 *     <EmptyStateDescription>
 *       Press <Kbd>i</Kbd> to install your first one.
 *     </EmptyStateDescription>
 *   </EmptyState>
 *
 * Title is bold + dim; description is plain dim. Layout is flat so
 * the block flows inline inside whatever container the consumer
 * wired up — no centering tricks since terminal alignment is
 * brittle across widths. Compose your own framing (border, padding)
 * around it when you want a card-style empty block.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly children?: ReactNode;
}

export function EmptyState({ children }: Readonly<EmptyStateProps>): React.ReactElement {
  return <Box flexDirection="column">{children}</Box>;
}

export function EmptyStateTitle({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Text bold dimColor>
      {children}
    </Text>
  );
}

export function EmptyStateDescription({
  children,
}: Readonly<{ children?: ReactNode }>): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text dimColor>{children}</Text>
    </Box>
  );
}
