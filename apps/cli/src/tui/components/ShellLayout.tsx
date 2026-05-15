/**
 * Outer chrome for every section of the brika TUI:
 *
 *   ┌─ ShellHeader ────────────────────────────────────┐
 *   │ Sidebar │              Outlet                    │
 *   ├─────────┴────────────────────────────────────────┤
 *   │              ShellFooter                         │
 *   └──────────────────────────────────────────────────┘
 *
 * `Outlet` is `@brika/tui`'s router outlet — whichever route is
 * active renders into the right column. Section views never have to
 * draw their own header/footer/sidebar.
 *
 * The outer box is locked to the real terminal dimensions so the
 * whole frame fills the window (Ink defaults to content-size, which
 * leaves the right and bottom edges empty for narrow views like
 * Settings).
 */

import { Outlet, useTerminalSize } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';
import { ShellFooter } from './ShellFooter';
import { ShellHeader } from './ShellHeader';
import { Sidebar } from './Sidebar';

export function ShellLayout(): React.ReactElement {
  const { columns, rows } = useTerminalSize();
  return (
    <Box flexDirection="column" width={columns} height={rows} paddingX={1} paddingY={1}>
      <ShellHeader />
      <Box flexGrow={1} marginTop={1}>
        <Sidebar />
        <Box flexDirection="column" flexGrow={1} paddingLeft={2}>
          <Outlet />
        </Box>
      </Box>
      <ShellFooter />
    </Box>
  );
}
