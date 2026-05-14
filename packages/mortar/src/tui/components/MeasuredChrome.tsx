/**
 * Wraps the non-log "chrome" of a view (footer, banners, status bars)
 * and reports its rendered height back to `MortarProvider`, which uses
 * it to size the log pane. This is the flex glue: any view that uses
 * the shared log pane wraps its footer-ish content in `<MeasuredChrome>`
 * and the available log height adapts to fit.
 *
 *   <Box flexDirection="column" height={layout.rows}>
 *     <Box flexGrow={1}>…log…</Box>
 *     <MeasuredChrome>
 *       <Footer />
 *     </MeasuredChrome>
 *   </Box>
 *
 * Falls back to {@link TUI_CHROME_LINES} on the first frame (the box
 * hasn't been measured yet); the second frame has the real height.
 */

import { Box } from 'ink';
import type React from 'react';
import { useEffect } from 'react';
import { useMeasure } from '../state/useMeasure';
import { useMortar } from '../useMortar';

export interface MeasuredChromeProps {
  readonly children: React.ReactNode;
}

export function MeasuredChrome({ children }: Readonly<MeasuredChromeProps>): React.ReactElement {
  const [ref, { height }] = useMeasure();
  const { setChromeHeight } = useMortar();

  useEffect(() => {
    if (height > 0) {
      setChromeHeight(height);
    }
  }, [height, setChromeHeight]);

  return (
    <Box ref={ref} flexDirection="column" flexShrink={0}>
      {children}
    </Box>
  );
}
