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
 *   Tab          focus the README pane → arrow / page keys scroll it;
 *                Esc returns focus to the list
 *   /            filter the list — type to narrow, Enter / Esc exits
 *   e            enable focused plugin
 *   D            disable focused plugin (shift, so `d` keeps its
 *                global "dashboard" role)
 *   R            reload focused plugin
 *   k            kill focused plugin
 *   X            uninstall focused plugin (y/n confirm)
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
import { Markdown } from '../components/Markdown';
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
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const [readme, setReadme] = useState<{ uid: string; text: string } | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');
  const [pendingUninstall, setPendingUninstall] = useState<PluginListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const allItems = list.data ?? [];
  const items = useMemo(() => filterPlugins(allItems, filter), [allItems, filter]);
  const focused = focusedUid ? (items.find((p) => p.uid === focusedUid) ?? null) : null;
  const focusedMetrics = useLiveMetrics(focused?.uid ?? null, focused?.status === 'running');

  // Load README whenever the focused plugin changes.
  useEffect(() => {
    if (!focused) {
      setReadme(null);
      return;
    }
    if (readme?.uid === focused.uid) {
      return;
    }
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

  const interactive = Boolean(focused);

  const runAction = (action: 'enable' | 'disable' | 'kill' | 'reload') => () => {
    if (!focused) {
      return;
    }
    setActionError(null);
    void pluginAction(focused.uid, action)
      .then(list.refresh)
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

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
              setFocusedUid(null);
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

      <Box flexGrow={1} flexShrink={1} minHeight={6}>
        <Box flexDirection="column" minWidth={32} marginRight={2} flexShrink={0}>
          <PluginRows
            items={items}
            allCount={allItems.length}
            focusedUid={focusedUid}
            onFocusChange={setFocusedUid}
          />
          {focused && <PluginMeta plugin={focused} metrics={focusedMetrics} />}
        </Box>

        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <ReadmePane
            hasFocus={Boolean(focused)}
            loading={readmeLoading}
            error={readmeError}
            text={readme?.text ?? null}
            uid={focused?.uid ?? null}
          />
        </Box>
      </Box>

      <Box marginTop={1} flexShrink={0}>
        <Button shortcut="e" variant="success" enabled={interactive} onPress={runAction('enable')}>
          enable
        </Button>
        <Button shortcut="D" variant="warning" enabled={interactive} onPress={runAction('disable')}>
          disable
        </Button>
        <Button shortcut="R" enabled={interactive} onPress={runAction('reload')}>
          reload
        </Button>
        <Button shortcut="k" enabled={interactive} onPress={runAction('kill')}>
          kill
        </Button>
        <Button
          shortcut="X"
          variant="destructive"
          enabled={interactive}
          onPress={() => focused && setPendingUninstall(focused)}
        >
          uninstall
        </Button>
      </Box>

      <HintBar>
        <Hint k="↑↓">select</Hint>
        <Hint k="Tab">scroll readme</Hint>
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
}

function PluginRows({
  items,
  allCount,
  focusedUid,
  onFocusChange,
}: Readonly<PluginRowsProps>): React.ReactElement {
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
  return (
    <List value={focusedUid ?? undefined} onValueChange={onFocusChange}>
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
    <ScrollArea key={uid ?? 'no-uid'} id={`readme-${uid ?? 'none'}`}>
      <Markdown source={text} />
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
      {selected ? (
        <Box marginTop={1}>
          <RegistryDetail
            item={selected}
            installed={isInstalled(selected)}
            installing={installingName === selected.name}
            progress={installingName === selected.name ? progress : null}
            error={installingName === selected.name ? installError : null}
            onInstall={() => void startInstall(selected)}
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
      <ScrollArea key={packageName ?? 'no-pkg'} id={`registry-readme-${packageName ?? 'none'}`}>
        <Markdown source={source} />
      </ScrollArea>
    );
  }
  return <Text dimColor>no readme bundled with this package</Text>;
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
 * Detail panel for the focused registry hit — full preview surface,
 * not just a meta card. Renders:
 *
 *   - header: display name + version + status badges (installed /
 *     incompatible / installing)
 *   - <Properties> strip with source / version / downloads / compat
 *   - description line from the package manifest
 *   - the package's README, fetched on demand from `/api/registry/
 *     plugins/:name/readme` and rendered through `<Markdown>` so
 *     tables, code blocks, links, lists all render natively
 *   - live install-progress strip when Ctrl+Enter has been fired
 *     against this row
 *
 * The pane is what the user lands in after Enter on a search hit;
 * Ctrl+Enter at any point fires the install (handled by the parent
 * Search wrapper, so this component is purely a viewer).
 */
function RegistryDetail({
  item,
  installed,
  installing,
  progress,
  error,
  onInstall,
}: Readonly<{
  item: RegistrySearchResult;
  installed: boolean;
  installing: boolean;
  progress: InstallProgress | null;
  error: string | null;
  onInstall: () => void;
}>): React.ReactElement {
  const accent = pickDetailAccent({ error, installing, installed });
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
    <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
      <Box>
        <Text bold>{item.displayName ?? item.name}</Text>
        <Text dimColor> v{item.version} </Text>
        <RegistryStatusBadge
          installed={installed}
          installing={installing}
          compatible={item.compatible}
        />
      </Box>

      <Box marginTop={1}>
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
        <Box marginTop={1}>
          <Text>{item.description}</Text>
        </Box>
      ) : null}

      {/* README — the headline content of the detail pane */}
      <Box marginTop={1} flexDirection="column">
        <RegistryReadme
          loading={readmeLoading}
          error={readmeError}
          source={readme}
          packageName={item.name}
        />
      </Box>

      {/* Sticky footer: install progress / error / hint */}
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
      {!installed && !installing && !error ? (
        <Box marginTop={1}>
          <Button
            shortcut="ctrl+enter"
            variant="success"
            enabled={item.compatible}
            onPress={onInstall}
          >
            install
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
