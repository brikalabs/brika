/**
 * Main view — the default screen.
 *
 *   left:   ServiceList   (focused service highlighted)
 *   right:  LogPane       (windowed tail of focused service)
 *   bottom: Footer        (URL line + keybinds / search status / toast)
 *
 * Reads everything from `useMortar()`. Keybinds live in `mainKeys.ts`
 * and are registered with a single hook call so this file stays
 * focused on layout.
 */

import { Box } from 'ink';
import type React from 'react';
import { serviceUrl } from '../../config';
import { Footer } from '../components/Footer';
import { LogPane } from '../components/LogPane';
import { MeasuredChrome } from '../components/MeasuredChrome';
import { ServiceList } from '../components/ServiceList';
import { useMainKeybinds } from '../keys/useMainKeybinds';
import { useMortar } from '../useMortar';
import { effectiveScrollOffset } from '../utils/scroll';

export function MainView(): React.ReactElement {
  useMainKeybinds();
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
          inputModeFor={null}
        />
      </MeasuredChrome>
    </Box>
  );
}
