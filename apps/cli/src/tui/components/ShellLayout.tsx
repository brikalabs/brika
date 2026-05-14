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
 */

import { Outlet } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';
import { ShellFooter } from './ShellFooter';
import { ShellHeader } from './ShellHeader';
import { Sidebar } from './Sidebar';

export function ShellLayout(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <ShellHeader />
      <Box marginTop={1}>
        <Sidebar />
        <Box flexDirection="column" flexGrow={1} paddingLeft={2}>
          <Outlet />
        </Box>
      </Box>
      <ShellFooter />
    </Box>
  );
}
