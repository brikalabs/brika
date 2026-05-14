/**
 * Input-forwarding mode. Reuses the main layout (service list + log
 * pane) so the user can see the child's output while typing; the
 * footer switches to an INPUT banner. Every key except Esc is
 * translated and written to the focused service's stdin.
 *
 * Receives the target `serviceId` as a route param so we can write
 * to the right pipe even if the user tab-switches in the future
 * (currently disabled while in input mode — the focus is locked).
 */

import { Box, useInput } from 'ink';
import type React from 'react';
import { serviceUrl } from '../../config';
import { useRouter } from '../../router';
import { Footer } from '../components/Footer';
import { LogPane } from '../components/LogPane';
import { MeasuredChrome } from '../components/MeasuredChrome';
import { ServiceList } from '../components/ServiceList';
import { keyToBytes } from '../keys/keyToBytes';
import type { Routes } from '../routes';
import { useMortar } from '../useMortar';
import { effectiveScrollOffset } from '../utils/scroll';

export interface InputViewProps {
  readonly serviceId: string;
}

export function InputView({ serviceId }: Readonly<InputViewProps>): React.ReactElement {
  const { supervisor, services, focus, scroll, search, toast, layout, fullscreen } = useMortar();
  const router = useRouter<Routes>();
  const focused = focus.focused;
  const focusedLogs = focused?.logs ?? [];

  const scrollOffset = effectiveScrollOffset(
    scroll.offset,
    search.query ? search.currentMatchLine : null,
    focusedLogs.length,
    layout.visible,
    layout.maxScroll
  );

  useInput((input, key) => {
    if (key.escape) {
      router.back();
      toast.showToast('Input mode exited');
      return;
    }
    const bytes = keyToBytes(input, key);
    if (bytes !== null) {
      supervisor.writeStdin(serviceId, bytes);
    }
  });

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
          inputModeFor={serviceId}
        />
      </MeasuredChrome>
    </Box>
  );
}
