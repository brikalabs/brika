/**
 * Wraps the non-log "chrome" of a view (footer, banners, status bars)
 * and reports its rendered height back to the shell context, which
 * uses it to size the log pane. This is the flex glue: any view that
 * uses the shared log pane wraps its footer-ish content in
 * `<MeasuredChrome>` and the available log height adapts to fit.
 *
 *   <Box flexDirection="column" height={rows}>
 *     <Box flexGrow={1}>…log…</Box>
 *     <MeasuredChrome>
 *       <Footer />
 *     </MeasuredChrome>
 *   </Box>
 *
 * Falls back to the `initialChromeHeight` configured on the
 * `<TuiShellProvider>` on the first frame; the second frame has the
 * real height.
 */

import { Box } from 'ink';
import type React from 'react';
import { useEffect } from 'react';
import { useTuiShell } from '../shell/useTuiShell';
import { useMeasure } from '../state/useMeasure';

export interface MeasuredChromeProps {
  readonly children: React.ReactNode;
}

export function MeasuredChrome({ children }: Readonly<MeasuredChromeProps>): React.ReactElement {
  const [ref, { height }] = useMeasure();
  const { setChromeHeight } = useTuiShell();

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
