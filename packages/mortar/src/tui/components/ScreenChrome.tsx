/**
 * Common chrome for full-screen views (Help, Deps, Shutdown). Renders a
 * title bar at the top, the brand line at the bottom, and the view's
 * own content in between — so every view has a consistent visual
 * skeleton without each one re-inventing it.
 *
 *   <ScreenChrome title="Help" hint="? or Esc to close">
 *     …content…
 *   </ScreenChrome>
 *
 * The title bar uses ink's flex inversion so it stays one row even
 * when the title contains wide unicode glyphs. The brand line is dim
 * so it doesn't fight the content for attention.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { BRAND_LINE, MORTAR_WORDMARK } from '../../brand';

export interface ScreenChromeProps {
  /** Short label shown in the title bar (e.g. "Help", "Dependencies"). */
  readonly title: string;
  /** Optional accent color for the title — defaults to cyan. */
  readonly titleColor?: string;
  /** Optional one-line hint shown right of the title (keybinds, etc.). */
  readonly hint?: string;
  readonly children: React.ReactNode;
}

export function ScreenChrome({
  title,
  titleColor = 'cyan',
  hint,
  children,
}: Readonly<ScreenChromeProps>): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box paddingX={2} paddingY={0} flexDirection="row">
        <Text bold color={titleColor}>
          {MORTAR_WORDMARK}
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
      <Box paddingX={2}>
        <Text dimColor>{BRAND_LINE}</Text>
      </Box>
    </Box>
  );
}
