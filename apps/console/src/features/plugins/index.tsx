/**
 * Plugins section — tabbed layout with `installed` and `search` as
 * router sub-routes. The layout owns the chrome (heading + tabs);
 * each tab's body is its own route component, rendered by the nested
 * `<Outlet />`.
 *
 *   [Installed]  filterable list of installed plugins; Enter opens the
 *                detail page (status / pid / cpu / memory + README +
 *                enable / disable / reload / kill / uninstall).
 *   [Search]     type-to-search the registry; Enter opens the detail
 *                page (description / downloads / README + install).
 *
 * Tab navigation is handled by `<TabsList>` (`Tab` / `Shift+Tab` /
 * `←` / `→`). Inside a tab, each view owns its own keybinds:
 *
 *   List view:   ↑ / ↓ select · Enter open · / filter (Installed only)
 *   Detail view: Esc back · Tab scroll readme · e/D/R/k/X actions
 *                (Installed) · i install (Search)
 */

import { Heading, Outlet, Tabs, TabsList, TabsTrigger } from '@brika/tui';
import type React from 'react';
import { NotConnected } from '../../shared/components/NotConnected';
import { useCli } from '../../shared/hooks/useCli';

export { InstalledTab } from './installed';
export { SearchTab } from './search';

/**
 * Layout for the plugins section. The `installed` and `search` tabs
 * live as router sub-routes (see `routes.ts`), so `<Tabs router>` is
 * driven by the active path segment and `<Outlet />` renders the
 * matching child route's component. Switching tabs pushes a new
 * `navigatePath` entry, so `back()` walks tab history naturally.
 */
export function PluginsView(): React.ReactElement {
  const cli = useCli();
  if (cli.hub.state !== 'running') {
    return <NotConnected title="Plugins" />;
  }
  return (
    <Tabs router defaultValue="installed">
      <Heading>Plugins</Heading>
      <TabsList>
        <TabsTrigger value="installed">Installed</TabsTrigger>
        <TabsTrigger value="search">Search</TabsTrigger>
      </TabsList>
      <Outlet />
    </Tabs>
  );
}
