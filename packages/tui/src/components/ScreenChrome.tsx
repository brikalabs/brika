/**
 * Common chrome for full-screen views (Help, Deps, Shutdown). Renders a
 * title bar at the top, an optional brand line at the bottom, and the
 * view's own content in between — so every view has a consistent visual
 * skeleton without each one re-inventing it.
 *
 *   <ScreenChrome
 *     wordmark="▰▰ mortar"
 *     brand="mortar v0.3.1 · built by the Brika Labs team"
 *     title="Help"
 *     hint="? or Esc to close"
 *   >
 *     …content…
 *   </ScreenChrome>
 *
 * The title bar uses ink's flex inversion so it stays one row even
 * when the title contains wide unicode glyphs. The brand line is dim
 * so it doesn't fight the content for attention.
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface ScreenChromeProps {
  /** App wordmark shown bold at the top-left ("▰▰ mortar", etc.). */
  readonly wordmark: string;
  /** Short label shown right of the wordmark (e.g. "Help", "Dependencies"). */
  readonly title: string;
  /** Optional brand line shown dim at the bottom. Omit to hide. */
  readonly brand?: string;
  /** Optional accent color for the wordmark — defaults to cyan. */
  readonly titleColor?: string;
  /** Optional one-line hint shown right of the title (keybinds, etc.). */
  readonly hint?: string;
  readonly children: React.ReactNode;
}

export function ScreenChrome({
  wordmark,
  title,
  brand,
  titleColor = 'cyan',
  hint,
  children,
}: Readonly<ScreenChromeProps>): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={2} paddingY={0} flexDirection="row">
        <Text bold color={titleColor}>
          {wordmark}
        </Text>
        <Text dimColor> · </Text>
        <Text bold>{title}</Text>
        {hint && (
          <>
            <Text dimColor>{'   '}</Text>
            <Text dimColor>{hint}</Text>
          </>
        )}
      </Box>
      <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
        {children}
      </Box>
      {brand && (
        <Box paddingX={2}>
          <Text dimColor>{brand}</Text>
        </Box>
      )}
    </Box>
  );
}
