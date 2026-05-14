/**
 * Shared layout for the two screens that use the same anatomy:
 *
 *   ┌────────────────────────────────────────────┐
 *   │  ServiceList  │       LogPane              │  ← top row (flex-grows)
 *   ├────────────────────────────────────────────┤
 *   │             <Footer />                     │  ← bottom (measured)
 *   └────────────────────────────────────────────┘
 *
 * `MainView` and `InputView` share everything but the footer's
 * `inputModeFor` flag — extracting the layout removes a 23-line block
 * of duplicated JSX between them.
 */

import { Box } from 'ink';
import type React from 'react';
import { serviceUrl } from '../../config';
import { useMortar } from '../useMortar';
import { effectiveScrollOffset } from '../utils/scroll';
import { Footer } from './Footer';
import { LogPane } from './LogPane';
import { MeasuredChrome } from './MeasuredChrome';
import { ServiceList } from './ServiceList';

export interface MainLayoutProps {
  /**
   * Service id whose stdin keystrokes are being forwarded to, or
   * `null` for normal navigation mode. Switches the footer banner.
   */
  readonly inputModeFor: string | null;
}

export function MainLayout({ inputModeFor }: Readonly<MainLayoutProps>): React.ReactElement {
  const { services, focus, scroll, search, toast, layout, fullscreen } = useMortar();
  const focused = focus.focused;
  const focusedLogs = focused?.logs ?? [];
  const scrollOffset = effectiveScrollOffset(
    scroll.offset,
    search.query ? search.currentMatchLine : null,
    focusedLogs.length,
    layout.visible,
    layout.maxScroll
  );

  return (
    <Box flexDirection="column" height={layout.rows}>
      <Box flexGrow={1}>
        {!fullscreen.enabled && (
          <ServiceList services={services} focusedIndex={focus.focusedIndex} />
        )}
        {focused && (
          <LogPane
            service={focused}
            visible={layout.visible}
            scrollFromBottom={scrollOffset}
            maxScroll={layout.maxScroll}
            searchQuery={search.query}
            currentMatchLine={search.currentMatchLine}
          />
        )}
      </Box>
      <MeasuredChrome>
        <Footer
          search={search}
          url={focused ? serviceUrl(focused.spec, focused.detectedPort) : null}
          urlHealthy={focused?.status.kind === 'healthy'}
          toast={toast.toast}
          inputModeFor={inputModeFor}
        />
      </MeasuredChrome>
    </Box>
  );
}
