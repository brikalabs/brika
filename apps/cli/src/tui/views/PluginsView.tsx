/**
 * Plugins section — tabbed surface with list → detail navigation.
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

import {
  Badge,
  type BadgeVariant,
  Button,
  Confirm,
  ConfirmDescription,
  ConfirmTitle,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  FocusScope,
  Heading,
  Hint,
  HintBar,
  Input,
  List,
  ListItem,
  Properties,
  Property,
  ScrollArea,
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
  useMeasure,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPluginMetrics,
  fetchPluginReadme,
  fetchPlugins,
  fetchRegistryReadme,
  type InstallProgress,
  installFromRegistry,
  type PluginHealth,
  type PluginListItem,
  type PluginMetrics,
  pluginAction,
  type RegistrySearchResult,
  searchRegistry,
  uninstallPlugin,
} from '../../cli/hub-api';
import { MarkdownStream } from '../components/MarkdownStream';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

export function PluginsView(): React.ReactElement {
  const cli = useCli();
  if (cli.hub.state !== 'running') {
    return <NotConnected title="Plugins" />;
  }
  return (
    <Tabs defaultValue="installed">
      <Heading>Plugins</Heading>
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
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const allItems = list.data ?? [];
  const selected = selectedUid ? (allItems.find((p) => p.uid === selectedUid) ?? null) : null;

  if (selected) {
    return (
      <InstalledPluginDetail
        plugin={selected}
        onBack={() => setSelectedUid(null)}
        onRefresh={list.refresh}
        onUninstalled={() => {
          setSelectedUid(null);
          list.refresh();
        }}
      />
    );
  }

  return (
    <InstalledList
      items={allItems}
      loading={list.loading}
      error={list.error}
      onOpen={setSelectedUid}
    />
  );
}

function InstalledList({
  items: allItems,
  loading,
  error,
  onOpen,
}: Readonly<{
  items: ReadonlyArray<PluginListItem>;
  loading: boolean;
  error: string | null;
  onOpen: (uid: string) => void;
}>): React.ReactElement {
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');

  const items = useMemo(() => filterPlugins(allItems, filter), [allItems, filter]);

  useKey('/', () => setFilterMode(true));

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexShrink={0}>
        <Text dimColor>{items.length} installed</Text>
        {filter && (
          <>
            <Text dimColor> · filter </Text>
            <Text color="cyan">/{filter}/</Text>
          </>
        )}
        {loading && <Text dimColor> · loading…</Text>}
      </Box>
      {error && (
        <Box flexShrink={0}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {filterMode && (
        <Box marginBottom={1}>
          <FilterDraft
            initial={filter}
            onCommit={(v) => {
              setFilter(v);
              setFilterMode(false);
              setFocusedUid(null);
            }}
            onCancel={() => setFilterMode(false)}
          />
        </Box>
      )}

      <PluginRows
        items={items}
        allCount={allItems.length}
        focusedUid={focusedUid}
        onFocusChange={setFocusedUid}
        onSelect={onOpen}
      />

      <HintBar>
        <Hint k="↑↓">select</Hint>
        <Hint k="↵" accent="info">
          open
        </Hint>
        <Hint k="/" accent="info">
          filter
        </Hint>
        <Hint k="→" accent="info">
          search
        </Hint>
      </HintBar>
    </Box>
  );
}

/**
 * Detail page for one installed plugin. Owns its own README fetch,
 * live metrics polling, action buttons, and uninstall confirmation.
 * Esc / `back` button returns to the list.
 */
function InstalledPluginDetail({
  plugin,
  onBack,
  onRefresh,
  onUninstalled,
}: Readonly<{
  plugin: PluginListItem;
  onBack: () => void;
  onRefresh: () => void;
  onUninstalled: () => void;
}>): React.ReactElement {
  const metrics = useLiveMetrics(plugin.uid, plugin.status === 'running');
  const [readme, setReadme] = useState<string | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [pendingUninstall, setPendingUninstall] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadme(null);
    setReadmeError(null);
    setReadmeLoading(true);
    void (async () => {
      try {
        const text = await fetchPluginReadme(plugin.uid);
        if (!cancelled) {
          setReadme(text);
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
  }, [plugin.uid]);

  const runAction = (action: 'enable' | 'disable' | 'kill' | 'reload') => () => {
    setActionError(null);
    void pluginAction(plugin.uid, action)
      .then(onRefresh)
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexShrink={0}>
        <Text bold>{plugin.displayName ?? plugin.name}</Text>
        <Text dimColor> v{plugin.version} </Text>
        <Badge variant={STATUS_VARIANT[plugin.status] ?? 'secondary'}>{plugin.status}</Badge>
      </Box>

      {actionError && (
        <Box flexShrink={0}>
          <Text color="red">✗ {actionError}</Text>
        </Box>
      )}

      <Box flexShrink={0}>
        <PluginMeta plugin={plugin} metrics={metrics} />
      </Box>

      {pendingUninstall && (
        <Box marginTop={1} flexShrink={0}>
          <Confirm
            variant="destructive"
            onConfirm={async () => {
              setPendingUninstall(false);
              setActionError(null);
              try {
                await uninstallPlugin(plugin.uid);
                onUninstalled();
              } catch (e) {
                setActionError(e instanceof Error ? e.message : String(e));
              }
            }}
            onCancel={() => setPendingUninstall(false)}
          >
            <ConfirmTitle>Uninstall {plugin.displayName ?? plugin.name}?</ConfirmTitle>
            <ConfirmDescription>
              Removes the plugin from brika.yml and clears its state + secrets.
            </ConfirmDescription>
          </Confirm>
        </Box>
      )}

      <Box marginTop={1} flexGrow={1} flexShrink={1} minHeight={4}>
        <ReadmePane
          hasFocus
          loading={readmeLoading}
          error={readmeError}
          text={readme}
          uid={plugin.uid}
        />
      </Box>

      <FocusScope autoFocus>
        <Box marginTop={1} flexShrink={0}>
          <Button shortcut="escape" onPress={onBack}>
            back
          </Button>
          <Button shortcut="e" variant="success" onPress={runAction('enable')}>
            enable
          </Button>
          <Button shortcut="D" variant="warning" onPress={runAction('disable')}>
            disable
          </Button>
          <Button shortcut="R" onPress={runAction('reload')}>
            reload
          </Button>
          <Button shortcut="k" onPress={runAction('kill')}>
            kill
          </Button>
          <Button shortcut="X" variant="destructive" onPress={() => setPendingUninstall(true)}>
            uninstall
          </Button>
        </Box>
      </FocusScope>

      <HintBar>
        <Hint k="Esc">back</Hint>
        <Hint k="Tab">scroll readme</Hint>
      </HintBar>
    </Box>
  );
}

// ─── List rows + metadata strip ───────────────────────────────────────────

const STATUS_VARIANT: Readonly<Record<PluginHealth, BadgeVariant>> = {
  running: 'success',
  crashed: 'destructive',
  'crash-loop': 'destructive',
  restarting: 'warning',
  installing: 'warning',
  updating: 'warning',
  degraded: 'warning',
  incompatible: 'warning',
  stopped: 'secondary',
};

interface PluginRowsProps {
  readonly items: ReadonlyArray<PluginListItem>;
  readonly allCount: number;
  readonly focusedUid: string | null;
  readonly onFocusChange: (uid: string) => void;
  readonly onSelect?: (uid: string) => void;
}

function PluginRows({
  items,
  allCount,
  focusedUid,
  onFocusChange,
  onSelect,
}: Readonly<PluginRowsProps>): React.ReactElement {
  const [windowRef, windowSize] = useMeasure();
  const focusedIdx = useMemo(
    () => (focusedUid ? items.findIndex((p) => p.uid === focusedUid) : -1),
    [items, focusedUid]
  );
  const visibleRows = Math.max(1, windowSize.height);
  const [offset, setOffset] = useState(0);

  // Keep the cursor row inside the window — scroll the slice when the
  // user arrows past either edge. Re-clamp when the item count shrinks
  // (filter narrows, uninstall removes a row).
  useEffect(() => {
    setOffset((cur) => {
      const maxOffset = Math.max(0, items.length - visibleRows);
      const clamped = Math.min(cur, maxOffset);
      if (focusedIdx < 0) {
        return clamped;
      }
      if (focusedIdx < clamped) {
        return focusedIdx;
      }
      if (focusedIdx >= clamped + visibleRows) {
        return focusedIdx - visibleRows + 1;
      }
      return clamped;
    });
  }, [focusedIdx, visibleRows, items.length]);

  if (allCount === 0) {
    return (
      <EmptyState>
        <EmptyStateTitle>No plugins yet</EmptyStateTitle>
        <EmptyStateDescription>Press → to switch to Search and install one.</EmptyStateDescription>
      </EmptyState>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState>
        <EmptyStateTitle>Filter matches nothing</EmptyStateTitle>
        <EmptyStateDescription>
          Press <Text bold>/</Text> then Enter on an empty input to clear.
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  const clipped = items.length > visibleRows;
  const atTop = offset === 0;
  const atBot = offset + visibleRows >= items.length;

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} flexBasis={0} minHeight={1}>
      <Box ref={windowRef} overflow="hidden" flexGrow={1} flexShrink={1}>
        {/* flexShrink=0 prevents Yoga from collapsing the inner box
         *  when its negative marginTop pushes the bottom past the
         *  window — same trick as <ScrollArea>. */}
        <Box flexDirection="column" flexShrink={0} marginTop={-offset}>
          <List
            autoFocus
            id="plugins-installed-list"
            value={focusedUid ?? undefined}
            onValueChange={onFocusChange}
            onSelect={onSelect}
          >
            {items.map((p) => {
              const isFocusedRow = focusedUid === p.uid;
              return (
                <ListItem key={p.uid} value={p.uid}>
                  <Text bold={isFocusedRow}>{p.displayName ?? p.name}</Text>
                  <Text dimColor> v{p.version} </Text>
                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>{p.status}</Badge>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Box>
      {clipped && (
        <Box flexShrink={0}>
          <Text dimColor>
            {`${atTop ? '·' : '↑'} ${atBot ? '·' : '↓'}  ${offset + 1}-${Math.min(items.length, offset + visibleRows)}/${items.length}`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Polls `/api/plugins/:uid/metrics` every 2 s while the plugin is
 * enabled; returns the latest snapshot. `null` while disabled or
 * before the first response arrives.
 */
function useLiveMetrics(uid: string | null, enabled: boolean): PluginMetrics | null {
  const [metrics, setMetrics] = useState<PluginMetrics | null>(null);
  useEffect(() => {
    setMetrics(null);
    if (!uid || !enabled) {
      return;
    }
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const m = await fetchPluginMetrics(uid);
        if (!cancelled) {
          setMetrics(m);
        }
      } catch {
        // Metrics endpoint is best-effort — ignore transient errors.
      }
    };
    void tick();
    const t = setInterval(tick, 2_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [uid, enabled]);
  return metrics;
}

/**
 * Metadata + live runtime stats for the focused plugin — sits below
 * the list and matches what the web UI surfaces on its plugin row:
 * version, author/source links, PID, CPU%, memory. Receives the
 * shared metrics snapshot from the parent so we don't double-poll.
 */
function PluginMeta({
  plugin,
  metrics,
}: Readonly<{
  plugin: PluginListItem;
  metrics: PluginMetrics | null;
}>): React.ReactElement {
  const author = typeof plugin.author === 'string' ? plugin.author : plugin.author?.name;
  const repo = typeof plugin.repository === 'string' ? plugin.repository : plugin.repository?.url;
  return (
    <Box marginTop={1} flexDirection="column">
      <Properties>
        <Property name="version">{plugin.version}</Property>
        {author ? <Property name="author">{author}</Property> : null}
        {plugin.homepage ? <Property name="homepage">{plugin.homepage}</Property> : null}
        {repo && repo !== plugin.homepage ? <Property name="repo">{repo}</Property> : null}
        <PidProperty
          pid={metrics?.pid ?? plugin.pid ?? null}
          running={plugin.status === 'running'}
        />
        {metrics?.current ? (
          <>
            <Property name="cpu">
              <CpuBadge percent={metrics.current.cpu} />
            </Property>
            <Property name="memory">{formatBytes(metrics.current.memory)}</Property>
          </>
        ) : null}
      </Properties>
    </Box>
  );
}

function PidProperty({
  pid,
  running,
}: Readonly<{ pid: number | null; running: boolean }>): React.ReactElement | null {
  if (pid !== null) {
    return <Property name="pid">{String(pid)}</Property>;
  }
  if (running) {
    return <Property name="pid">—</Property>;
  }
  return null;
}

function cpuVariant(percent: number): BadgeVariant {
  if (percent >= 80) {
    return 'destructive';
  }
  if (percent >= 40) {
    return 'warning';
  }
  return 'secondary';
}

function CpuBadge({ percent }: Readonly<{ percent: number }>): React.ReactElement {
  return <Badge variant={cpuVariant(percent)}>{`${percent.toFixed(1)}%`}</Badge>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── README pane (scrollable) ─────────────────────────────────────────────

interface ReadmePaneProps {
  readonly hasFocus: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly text: string | null;
  /** Plugin uid — used as the `<ScrollArea>` key so the scroll
   *  position resets when the user picks a different plugin. */
  readonly uid: string | null;
}

function ReadmePane({
  hasFocus,
  loading,
  error,
  text,
  uid,
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
  return (
    <ScrollArea key={uid ?? 'no-uid'} id={`readme-${uid ?? 'none'}`} autoFocus>
      <MarkdownStream source={text} />
    </ScrollArea>
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

  if (selected) {
    return (
      <RegistryDetail
        item={selected}
        installed={isInstalled(selected)}
        installing={installingName === selected.name}
        progress={installingName === selected.name ? progress : null}
        error={installingName === selected.name ? installError : null}
        onInstall={() => void startInstall(selected)}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Search<RegistrySearchResult>
        value={query}
        onValueChange={setQuery}
        onSelect={(r) => setSelected(r)}
      >
        <SearchInput placeholder="search registry — `@brika/plugin-spotify`, `weather`, …" />
        <SearchResults>
          {results.map((r) => (
            <SearchItem key={`${r.source}:${r.name}`} value={r} itemKey={`${r.source}:${r.name}`}>
              <Text bold>{r.displayName ?? r.name}</Text>
              <Text dimColor> v{r.version}</Text>
              {isInstalled(r) ? <Text color="green"> · installed</Text> : null}
              {r.compatible ? null : <Text color="yellow"> · incompatible</Text>}
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
      <HintBar>
        <Hint k="↑↓">select</Hint>
        <Hint k="↵" accent="info">
          open
        </Hint>
        <Hint k="←" accent="info">
          installed
        </Hint>
      </HintBar>
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

function RegistryStatusBadge({
  installed,
  installing,
  compatible,
}: Readonly<{ installed: boolean; installing: boolean; compatible: boolean }>): React.ReactElement {
  if (installed) {
    return <Badge variant="success">installed</Badge>;
  }
  if (installing) {
    return <Badge variant="warning">installing</Badge>;
  }
  if (!compatible) {
    return <Badge variant="warning">incompatible</Badge>;
  }
  return <Badge variant="info">available</Badge>;
}

function RegistryReadme({
  loading,
  error,
  source,
  packageName,
}: Readonly<{
  loading: boolean;
  error: string | null;
  source: string | null;
  packageName: string | null;
}>): React.ReactElement {
  if (loading) {
    return <Text dimColor>loading readme…</Text>;
  }
  if (error) {
    return <Text color="red">readme: {error}</Text>;
  }
  if (source && source.trim().length > 0) {
    return (
      <ScrollArea
        key={packageName ?? 'no-pkg'}
        id={`registry-readme-${packageName ?? 'none'}`}
        autoFocus
      >
        <MarkdownStream source={source} />
      </ScrollArea>
    );
  }
  return <Text dimColor>no readme bundled with this package</Text>;
}

/**
 * Detail page for one registry search hit. Mirrors `InstalledPluginDetail`'s
 * shape — header / meta / README / actions / hints — but the action set
 * is just "install". Esc / back button returns to the search list.
 */
function RegistryDetail({
  item,
  installed,
  installing,
  progress,
  error,
  onInstall,
  onBack,
}: Readonly<{
  item: RegistrySearchResult;
  installed: boolean;
  installing: boolean;
  progress: InstallProgress | null;
  error: string | null;
  onInstall: () => void;
  onBack: () => void;
}>): React.ReactElement {
  const [readme, setReadme] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);

  // Fetch the README whenever the focused item changes. We key on
  // `name` (not the full result object) so re-renders that swap an
  // equivalent object don't re-fetch.
  useEffect(() => {
    let cancelled = false;
    setReadme(null);
    setReadmeError(null);
    setReadmeLoading(true);
    void (async () => {
      try {
        const text = await fetchRegistryReadme(item.name);
        if (!cancelled) {
          setReadme(text);
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
  }, [item.name]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexShrink={0}>
        <Text bold>{item.displayName ?? item.name}</Text>
        <Text dimColor> v{item.version} </Text>
        <RegistryStatusBadge
          installed={installed}
          installing={installing}
          compatible={item.compatible}
        />
      </Box>

      <Box marginTop={1} flexShrink={0}>
        <Properties>
          <Property name="package">{item.name}</Property>
          <Property name="source">{item.source}</Property>
          {item.compatibilityReason ? (
            <Property name="note">{item.compatibilityReason}</Property>
          ) : null}
          <Property name="downloads">{item.downloadCount.toLocaleString()}</Property>
        </Properties>
      </Box>

      {item.description ? (
        <Box marginTop={1} flexShrink={0}>
          <Text>{item.description}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} flexGrow={1} flexShrink={1} minHeight={4}>
        <RegistryReadme
          loading={readmeLoading}
          error={readmeError}
          source={readme}
          packageName={item.name}
        />
      </Box>

      {installing && progress ? (
        <Box marginTop={1} flexShrink={0}>
          <Text>
            <Text color="yellow">⠿ </Text>
            <Text bold>{progress.phase}</Text>
            {progress.message ? <Text dimColor>{` — ${progress.message}`}</Text> : null}
          </Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1} flexShrink={0}>
          <Text color="red">✗ {error}</Text>
        </Box>
      ) : null}

      <FocusScope autoFocus>
        <Box marginTop={1} flexShrink={0}>
          <Button shortcut="escape" onPress={onBack}>
            back
          </Button>
          {!installed && !installing ? (
            <Button shortcut="i" variant="success" enabled={item.compatible} onPress={onInstall}>
              install
            </Button>
          ) : null}
        </Box>
      </FocusScope>

      <HintBar>
        <Hint k="Esc">back</Hint>
        <Hint k="Tab">scroll readme</Hint>
      </HintBar>
    </Box>
  );
}
