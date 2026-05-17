/**
 * `<Badge>` — small coloured pill for status/state labels.
 *
 *   <Badge variant="success" dot>running</Badge>     →   ● running
 *   <Badge variant="warning">stale</Badge>           →     stale
 *   <Badge variant="destructive">crashed</Badge>     →     crashed
 *   <Badge>idle</Badge>                              →     idle  (dim)
 *
 * Modelled on shadcn's `<Badge>` — single component, prop-driven
 * variants. The TUI version skips background fills (terminals
 * render them inconsistently across themes) and leans on text colour
 * + an optional leading `●` for status semantics.
 *
 * Variants:
 *   - `default`     — plain text (no colour, no dim).
 *   - `secondary`   — dim grey. The neutral resting state.
 *   - `success`     — green.
 *   - `warning`     — yellow.
 *   - `destructive` — red.
 *   - `info`        — cyan.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info';

export interface BadgeProps {
  readonly variant?: BadgeVariant;
  /** Render a leading `●` in the variant's colour. */
  readonly dot?: boolean;
  /** Render with bold weight. */
  readonly bold?: boolean;
  readonly children?: ReactNode;
}

const VARIANT_COLOR: Readonly<Record<BadgeVariant, string | undefined>> = {
  default: undefined,
  secondary: undefined, // rendered via `dimColor`, not a colour
  success: 'green',
  warning: 'yellow',
  destructive: 'red',
  info: 'cyan',
};

export function Badge({
  variant = 'secondary',
  dot = false,
  bold = false,
  children,
}: Readonly<BadgeProps>): React.ReactElement {
  const color = VARIANT_COLOR[variant];
  const dim = variant === 'secondary';
  return (
    <Box>
      {dot ? (
        <Text color={color} dimColor={dim}>
          ●{' '}
        </Text>
      ) : null}
      <Text color={color} dimColor={dim} bold={bold}>
        {children}
      </Text>
    </Box>
  );
}
