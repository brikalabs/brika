/**
 * Plugins section — tabbed surface.
 *
 *   [Installed]  filterable list of installed plugins + per-plugin
 *                README + enable/disable/reload/kill/uninstall.
 *   [Search]     type-to-search the registry; Enter installs.
 *
 * Tab navigation is handled by `<TabsList>` (`Tab` / `Shift+Tab` /
 * `←` / `→`). Inside a tab, each panel owns its own keybinds.
 *
 * Installed-tab keys (active when no overlay is open):
 *   ↑ / ↓        move selection
 *   PgUp / PgDn  scroll the README pane (10 lines at a time)
 *   /            filter the list — type to narrow, Enter / Esc exits
 *   e            enable focused plugin
 *   D            disable focused plugin (shift, so `d` keeps its
 *                global "dashboard" role)
 *   R            reload focused plugin
 *   k            kill focused plugin
 *   X            uninstall focused plugin (y/n confirm)
 */

import {
  Confirm,
  ConfirmDescription,
  ConfirmTitle,
  Input,
  Search,
  SearchEmpty,
  SearchInput,
  SearchItem,
  SearchResults,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useKey,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPluginReadme,
  fetchPlugins,
  type InstallProgress,
  installFromRegistry,
  type PluginListItem,
  pluginAction,
  type RegistrySearchResult,
  searchRegistry,
  uninstallPlugin,
} from '../../cli/hub-api';
import { Markdown } from '../components/Markdown';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

const README_PAGE_LINES = 10;

export function PluginsView(): React.ReactElement {
  const cli = useCli();
  if (cli.hub.state !== 'running') {
    return <NotConnected title="Plugins" />;
  }
  return (
    <Tabs defaultValue="installed">
      <Box marginBottom={1}>
        <Text bold>Plugins</Text>
      </Box>
      <TabsList>
        <TabsTrigger value="installed">Installed</TabsTrigger>
        <TabsTrigger value="search">Search</TabsTrigger>
      </TabsList>
      <TabsContent value="installed">
        <InstalledTab />
      </TabsContent>
      <TabsContent value="search">
        <SearchTab />
      </TabsContent>
    </Tabs>
  );
}

function InstalledTab(): React.ReactElement {
  const list = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const [focusIndex, setFocusIndex] = useState(0);
  const [readme, setReadme] = useState<{ uid: string; text: string } | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeScroll, setReadmeScroll] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');
  const [pendingUninstall, setPendingUninstall] = useState<PluginListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const allItems = list.data ?? [];
  const items = useMemo(() => filterPlugins(allItems, filter), [allItems, filter]);
  const focused = items[focusIndex];

  // Keep focus index in range as the filter narrows the list.
  useEffect(() => {
    if (focusIndex >= items.length && items.length > 0) {
      setFocusIndex(items.length - 1);
    } else if (items.length === 0 && focusIndex !== 0) {
      setFocusIndex(0);
    }
  }, [items.length, focusIndex]);

  // Reset README scroll when focus changes.
  useEffect(() => {
    setReadmeScroll(0);
  }, []);

  // Load README whenever the focused plugin changes.
  useEffect(() => {
    if (!focused) {
      setReadme(null);
      return;
    }
    if (readme?.uid === focused.uid) {
      return;
    }
    setReadmeScroll(0);
    let cancelled = false;
    setReadmeLoading(true);
    setReadmeError(null);
    void (async () => {
      try {
        const text = await fetchPluginReadme(focused.uid);
        if (!cancelled) {
          setReadme({ uid: focused.uid, text });
        }
      } catch (e) {
        if (!cancelled) {
          setReadmeError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setReadmeLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focused, readme?.uid]);

  const overlayOpen = filterMode || pendingUninstall !== null;
  const interactive = !overlayOpen && Boolean(focused);

  const runAction = (action: 'enable' | 'disable' | 'kill' | 'reload') => () => {
    if (!focused) {
      return;
    }
    setActionError(null);
    void pluginAction(focused.uid, action)
      .then(list.refresh)
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  // Navigation + actions
  useKey('upArrow', () => setFocusIndex((i) => Math.max(0, i - 1)), !overlayOpen);
  useKey(
    'downArrow',
    () => setFocusIndex((i) => Math.min(items.length - 1, i + 1)),
    !overlayOpen && items.length > 0
  );
  useKey('pageUp', () => setReadmeScroll((s) => Math.max(0, s - README_PAGE_LINES)), !overlayOpen);
  useKey('pageDown', () => setReadmeScroll((s) => s + README_PAGE_LINES), !overlayOpen);
  useKey('/', () => setFilterMode(true), !overlayOpen);
  useKey('e', runAction('enable'), interactive);
  useKey('D', runAction('disable'), interactive);
  useKey('k', runAction('kill'), interactive);
  useKey('R', runAction('reload'), interactive);
  useKey('X', () => focused && setPendingUninstall(focused), interactive);

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{items.length} installed</Text>
        {filter && (
          <>
            <Text dimColor> · filter </Text>
            <Text color="cyan">/{filter}/</Text>
          </>
        )}
        {list.loading && <Text dimColor> · loading…</Text>}
        {list.error && <Text color="red"> · {list.error}</Text>}
        {actionError && <Text color="red"> · {actionError}</Text>}
      </Box>

      {filterMode && (
        <Box marginBottom={1}>
          <FilterDraft
            initial={filter}
            onCommit={(v) => {
              setFilter(v);
              setFilterMode(false);
              setFocusIndex(0);
            }}
            onCancel={() => setFilterMode(false)}
          />
        </Box>
      )}

      {pendingUninstall && (
        <Box marginBottom={1}>
          <Confirm
            variant="destructive"
            onConfirm={async () => {
              const target = pendingUninstall;
              setPendingUninstall(null);
              setActionError(null);
              try {
                await uninstallPlugin(target.uid);
                list.refresh();
              } catch (e) {
                setActionError(e instanceof Error ? e.message : String(e));
              }
            }}
            onCancel={() => setPendingUninstall(null)}
          >
            <ConfirmTitle>
              Uninstall {pendingUninstall.displayName ?? pendingUninstall.name}?
            </ConfirmTitle>
            <ConfirmDescription>
              Removes the plugin from brika.yml and clears its state + secrets.
            </ConfirmDescription>
          </Confirm>
        </Box>
      )}

      <Box>
        <Box flexDirection="column" minWidth={32} marginRight={2}>
          <PluginList items={items} allCount={allItems.length} focusIndex={focusIndex} />
          {focused && <PluginMeta plugin={focused} />}
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          <ReadmePane
            hasFocus={Boolean(focused)}
            loading={readmeLoading}
            error={readmeError}
            text={readme?.text ?? null}
            scroll={readmeScroll}
          />
        </Box>
      </Box>

      <Footer />
    </Box>
  );
}

// ─── List row + metadata strip ─────────────────────────────────────────────

function PluginRow({
  plugin,
  focused,
}: Readonly<{ plugin: PluginListItem; focused: boolean }>): React.ReactElement {
  const state = plugin.enabled ? (plugin.state ?? 'idle') : 'disabled';
  return (
    <Box>
      <Text color={focused ? 'cyan' : undefined}>{focused ? '▸ ' : '  '}</Text>
      <Text bold={focused}>{plugin.displayName ?? plugin.name}</Text>
      <Text dimColor> v{plugin.version}</Text>
      <Text> </Text>
      <StateBadge state={state} />
    </Box>
  );
}

const STATE_COLOR: Readonly<Record<string, string>> = {
  running: 'green',
  crashed: 'red',
  loading: 'yellow',
  disabled: 'gray',
};

function StateBadge({ state }: Readonly<{ state: string }>): React.ReactElement {
  return (
    <Text color={STATE_COLOR[state]} dimColor={state === 'disabled' || state === 'idle'}>
      · {state}
    </Text>
  );
}

interface PluginListProps {
  readonly items: ReadonlyArray<PluginListItem>;
  readonly allCount: number;
  readonly focusIndex: number;
}

function PluginList({
  items,
  allCount,
  focusIndex,
}: Readonly<PluginListProps>): React.ReactElement {
  if (allCount === 0) {
    return <Text dimColor>(no plugins yet — press i to install)</Text>;
  }
  if (items.length === 0) {
    return <Text dimColor>(filter matches nothing — Esc / clear with `/`+Enter)</Text>;
  }
  return (
    <>
      {items.map((p, i) => (
        <PluginRow key={p.uid} plugin={p} focused={i === focusIndex} />
      ))}
    </>
  );
}

function PluginMeta({ plugin }: Readonly<{ plugin: PluginListItem }>): React.ReactElement {
  const author = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;
  const repo = typeof plugin.repository === 'string' ? plugin.repository : plugin.repository?.url;
  const pieces: React.ReactNode[] = [];
  if (author) {
    pieces.push(<Text key="a" dimColor>{`by ${author}`}</Text>);
  }
  if (plugin.homepage) {
    pieces.push(
      <Text key="h" dimColor>
        {plugin.homepage}
      </Text>
    );
  }
  if (repo && repo !== plugin.homepage) {
    pieces.push(
      <Text key="r" dimColor>
        {repo}
      </Text>
    );
  }
  if (pieces.length === 0) {
    return <Box />;
  }
  return (
    <Box marginTop={1} flexDirection="column">
      {pieces.map((p, i) => (
        <Box key={`pm-${i}`}>{p}</Box>
      ))}
    </Box>
  );
}

// ─── README pane (scrollable) ─────────────────────────────────────────────

interface ReadmePaneProps {
  readonly hasFocus: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly text: string | null;
  readonly scroll: number;
}

function ReadmePane({
  hasFocus,
  loading,
  error,
  text,
  scroll,
}: Readonly<ReadmePaneProps>): React.ReactElement {
  if (!hasFocus) {
    return <Text dimColor>(select a plugin)</Text>;
  }
  if (loading) {
    return <Text dimColor>loading readme…</Text>;
  }
  if (error) {
    return <Text color="red">{error}</Text>;
  }
  if (!text) {
    return <Text dimColor>no readme</Text>;
  }
  // Scroll by dropping the first `scroll` source lines. Cheap and
  // works regardless of how much each rendered block expands to.
  const lines = text.split('\n');
  const sliced = scroll > 0 ? lines.slice(Math.min(scroll, Math.max(0, lines.length - 5))) : lines;
  return (
    <Box flexDirection="column">
      {scroll > 0 && (
        <Box>
          <Text dimColor>↑ {scroll} lines hidden — PgUp to scroll back</Text>
        </Box>
      )}
      <Markdown source={sliced.join('\n')} />
    </Box>
  );
}

// ─── Filter input ─────────────────────────────────────────────────────────

function filterPlugins(items: ReadonlyArray<PluginListItem>, filter: string): PluginListItem[] {
  const q = filter.trim().toLowerCase();
  if (q.length === 0) {
    return [...items];
  }
  return items.filter((p) => {
    const hay = `${p.name} ${p.displayName ?? ''} ${p.description ?? ''}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Thin wrapper around `<Input>` for the `/`-driven list filter:
 *  keeps a draft buffer locally so Enter commits and Esc cancels. */
function FilterDraft({
  initial,
  onCommit,
  onCancel,
}: Readonly<{
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}>): React.ReactElement {
  const [draft, setDraft] = useState(initial);
  return (
    <Box flexDirection="column">
      <Input
        value={draft}
        onChange={setDraft}
        onSubmit={onCommit}
        onCancel={onCancel}
        placeholder="filter plugins…"
      />
      <Text dimColor>Enter — apply · Esc — cancel</Text>
    </Box>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────

function Footer(): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text dimColor>↑↓ select · PgUp/PgDn scroll readme · </Text>
      <Text bold color="cyan">
        /
      </Text>
      <Text dimColor> filter · </Text>
      <Text color="green">e</Text>
      <Text dimColor> enable · </Text>
      <Text color="yellow">D</Text>
      <Text dimColor> disable · </Text>
      <Text>R</Text>
      <Text dimColor> reload · </Text>
      <Text>k</Text>
      <Text dimColor> kill · </Text>
      <Text color="red">X</Text>
      <Text dimColor> uninstall · </Text>
      <Text bold color="cyan">
        Tab
      </Text>
      <Text dimColor> Search</Text>
    </Box>
  );
}

/**
 * Search tab — type to search the registry, Enter on a hit to load
 * its details/README into a panel, Ctrl+Enter to install. Two-stage
 * so a misfired Enter never installs something the user didn't mean.
 *
 * Owns its own copy of the installed-name set (refetched on tab
 * focus) so the "installed" badge stays accurate without needing the
 * Installed tab to be mounted.
 */
function SearchTab(): React.ReactElement {
  const installed = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const installedNames = useMemo(
    () => new Set((installed.data ?? []).map((p) => p.name)),
    [installed.data]
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReadonlyArray<RegistrySearchResult>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegistrySearchResult | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installingName, setInstallingName] = useState<string | null>(null);

  // Debounced async search.
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const hits = await searchRegistry(query);
          if (!cancelled) {
            setResults(hits);
            setSearchError(null);
          }
        } catch (e) {
          if (!cancelled) {
            setSearchError(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) {
            setSearching(false);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const isInstalled = useCallback(
    (r: RegistrySearchResult): boolean => r.installed || installedNames.has(r.name),
    [installedNames]
  );

  const startInstall = useCallback(
    async (pkg: RegistrySearchResult) => {
      if (isInstalled(pkg) || installingName !== null) {
        return;
      }
      setInstallingName(pkg.name);
      setInstallError(null);
      setProgress({ phase: 'starting', message: pkg.name });
      try {
        for await (const event of installFromRegistry(pkg.name, pkg.version)) {
          setProgress(event);
          if (event.phase === 'complete') {
            installed.refresh();
            setInstallingName(null);
            return;
          }
          if (event.phase === 'error') {
            setInstallError(event.message ?? 'install failed');
            setInstallingName(null);
            return;
          }
        }
      } catch (e) {
        setInstallError(e instanceof Error ? e.message : String(e));
        setInstallingName(null);
      }
    },
    [installed, installingName, isInstalled]
  );

  return (
    <Box flexDirection="column">
      <Search<RegistrySearchResult>
        value={query}
        onValueChange={setQuery}
        onSelect={(r) => setSelected(r)}
        onAction={(r) => void startInstall(r)}
      >
        <SearchInput placeholder="search registry — `@brika/plugin-spotify`, `weather`, …" />
        <SearchResults>
          {results.map((r) => (
            <SearchItem key={`${r.source}:${r.name}`} value={r} itemKey={`${r.source}:${r.name}`}>
              <Text bold>{r.displayName ?? r.name}</Text>
              <Text dimColor> v{r.version}</Text>
              {isInstalled(r) ? <Text color="green"> · installed</Text> : null}
              {!r.compatible ? <Text color="yellow"> · incompatible</Text> : null}
              {r.description ? <Text dimColor>{` — ${r.description}`}</Text> : null}
            </SearchItem>
          ))}
        </SearchResults>
        <SearchEmpty>start typing to search the registry</SearchEmpty>
        <SearchStatus
          searching={searching}
          error={searchError}
          query={query}
          resultCount={results.length}
        />
      </Search>
      {selected ? (
        <Box marginTop={1}>
          <RegistryDetail
            item={selected}
            installed={isInstalled(selected)}
            installing={installingName === selected.name}
            progress={installingName === selected.name ? progress : null}
            error={installingName === selected.name ? installError : null}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/** Tiny status strip under the search input — `Search` is pure UI;
 *  view-level "searching…" / "no matches" wording lives next to the
 *  data source that produces them. */
function SearchStatus({
  searching,
  error,
  query,
  resultCount,
}: Readonly<{
  searching: boolean;
  error: string | null;
  query: string;
  resultCount: number;
}>): React.ReactElement | null {
  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }
  if (searching) {
    return (
      <Box>
        <Text dimColor>searching…</Text>
      </Box>
    );
  }
  if (query.trim().length > 0 && resultCount === 0) {
    return (
      <Box>
        <Text dimColor>no matches</Text>
      </Box>
    );
  }
  if (resultCount > 0) {
    return (
      <Box>
        <Text dimColor>Enter — open · Ctrl+Enter — install</Text>
      </Box>
    );
  }
  return null;
}

/** Border colour for the detail card — error wins, then in-flight
 *  install, then "already installed", default cyan. */
function pickDetailAccent({
  error,
  installing,
  installed,
}: Readonly<{ error: string | null; installing: boolean; installed: boolean }>): string {
  if (error) {
    return 'red';
  }
  if (installing) {
    return 'yellow';
  }
  if (installed) {
    return 'green';
  }
  return 'cyan';
}

/**
 * Detail card for the focused registry hit — shown below the search
 * list once the user presses Enter on a row. Renders the plugin's
 * basic metadata and a live install-progress strip when Ctrl+Enter
 * has been fired against this row.
 */
function RegistryDetail({
  item,
  installed,
  installing,
  progress,
  error,
}: Readonly<{
  item: RegistrySearchResult;
  installed: boolean;
  installing: boolean;
  progress: InstallProgress | null;
  error: string | null;
}>): React.ReactElement {
  const accent = pickDetailAccent({ error, installing, installed });
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
      <Box>
        <Text bold>{item.displayName ?? item.name}</Text>
        <Text dimColor> v{item.version}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {`source: ${item.source}`}
          {` · ${installed ? 'installed' : 'not installed'}`}
          {item.compatible ? '' : ' · incompatible'}
          {` · ${item.downloadCount.toLocaleString()} downloads`}
        </Text>
      </Box>
      {item.description ? (
        <Box marginTop={1}>
          <Text>{item.description}</Text>
        </Box>
      ) : null}
      {installing && progress ? (
        <Box marginTop={1}>
          <Text>
            <Text color="yellow">⠿ </Text>
            <Text bold>{progress.phase}</Text>
            {progress.message ? <Text dimColor>{` — ${progress.message}`}</Text> : null}
          </Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      {!installed && !installing ? (
        <Box marginTop={1}>
          <Text dimColor>Ctrl+Enter to install</Text>
        </Box>
      ) : null}
    </Box>
  );
}
