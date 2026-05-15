/**
 * Plugins section — two-pane view.
 *
 *   Left:   filterable list of installed plugins from `/api/plugins`
 *           with a one-line metadata strip below.
 *   Right:  focused plugin's README, scrollable, rendered by the
 *           Markdown component on `/api/plugins/:uid/readme`.
 *
 * Keybinds (active when no overlay is open):
 *   ↑ / ↓        move selection in the list
 *   PgUp / PgDn  scroll the README pane (10 lines at a time)
 *   /            filter the list — type to narrow, Enter / Esc exits
 *   i            open the registry search → install picker
 *   e            enable the focused plugin
 *   D            disable the focused plugin (shift, so `d` keeps its
 *                global "dashboard" role)
 *   R            reload the focused plugin
 *   k            kill the focused plugin
 *   X            uninstall the focused plugin (shows a y/n confirm)
 */

import { useCaptureInput, useKey } from '@brika/tui';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  const list = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const [focusIndex, setFocusIndex] = useState(0);
  const [readme, setReadme] = useState<{ uid: string; text: string } | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeScroll, setReadmeScroll] = useState(0);
  const [installing, setInstalling] = useState(false);
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

  const overlayOpen = installing || filterMode || pendingUninstall !== null;
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
  useKey('i', () => setInstalling(true), !overlayOpen);
  useKey('/', () => setFilterMode(true), !overlayOpen);
  useKey('e', runAction('enable'), interactive);
  useKey('D', runAction('disable'), interactive);
  useKey('k', runAction('kill'), interactive);
  useKey('R', runAction('reload'), interactive);
  useKey('X', () => focused && setPendingUninstall(focused), interactive);

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Plugins" />;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Plugins </Text>
        <Text dimColor>{items.length}</Text>
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

      {installing && (
        <Box marginBottom={1}>
          <SearchInstall
            onClose={() => setInstalling(false)}
            onInstalled={() => {
              setInstalling(false);
              list.refresh();
            }}
            installedNames={new Set(allItems.map((p) => p.name))}
          />
        </Box>
      )}

      {filterMode && (
        <Box marginBottom={1}>
          <FilterInput
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
            prompt={`Uninstall ${pendingUninstall.displayName ?? pendingUninstall.name}?`}
            details="Removes the plugin from brika.yml and clears its state + secrets."
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
          />
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

interface FilterInputProps {
  readonly initial: string;
  readonly onCommit: (value: string) => void;
  readonly onCancel: () => void;
}

function FilterInput({
  initial,
  onCommit,
  onCancel,
}: Readonly<FilterInputProps>): React.ReactElement {
  useCaptureInput();
  const [draft, setDraft] = useState(initial);
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onCommit(draft);
      return;
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setDraft((d) => d + input);
    }
  });
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">/ </Text>
      <Text>{draft}</Text>
      <Text color="cyan">▏</Text>
      <Text dimColor> Enter to filter · Esc cancels</Text>
    </Box>
  );
}

// ─── Confirm prompt ───────────────────────────────────────────────────────

interface ConfirmProps {
  readonly prompt: string;
  readonly details?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function Confirm({
  prompt,
  details,
  onConfirm,
  onCancel,
}: Readonly<ConfirmProps>): React.ReactElement {
  useCaptureInput();
  useInput((input, key) => {
    if (key.escape || input === 'n' || input === 'N') {
      onCancel();
      return;
    }
    if (input === 'y' || input === 'Y' || key.return) {
      onConfirm();
    }
  });
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Text bold color="red">
        {prompt}
      </Text>
      {details && (
        <Box marginTop={1}>
          <Text dimColor>{details}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text>
          <Text color="red">y</Text>
          <Text dimColor> uninstall · </Text>
          <Text>n</Text>
          <Text dimColor> / Esc cancel</Text>
        </Text>
      </Box>
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
      <Text bold color="cyan">
        i
      </Text>
      <Text dimColor> install · </Text>
      <Text color="green">e</Text>
      <Text dimColor> enable · </Text>
      <Text color="yellow">D</Text>
      <Text dimColor> disable · </Text>
      <Text>R</Text>
      <Text dimColor> reload · </Text>
      <Text>k</Text>
      <Text dimColor> kill · </Text>
      <Text color="red">X</Text>
      <Text dimColor> uninstall</Text>
    </Box>
  );
}

/**
 * Two-stage install picker: type a query → hub searches its configured
 * registries → arrow through the results, Enter installs the focused
 * package and streams progress. Esc cancels at any stage.
 *
 * Captures global input so the shell's `s/x/r/o` shortcuts stay muted
 * while the picker is open.
 */
interface SearchInstallProps {
  readonly onClose: () => void;
  readonly onInstalled: () => void;
  /** Names of plugins already installed — used to mark them in results
   *  and skip the install action when Enter lands on one. */
  readonly installedNames?: ReadonlySet<string>;
}

function SearchInstall({
  onClose,
  onInstalled,
  installedNames,
}: Readonly<SearchInstallProps>): React.ReactElement {
  // Mute global shell hotkeys (s/x/r/o/etc.) while the picker is open —
  // the hook auto-releases when this component unmounts.
  useCaptureInput();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegistrySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installing, setInstalling] = useState(false);

  // Debounced search — fires 300ms after the last keystroke.
  useEffect(() => {
    if (installing) {
      return;
    }
    if (query.trim().length === 0) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const found = await searchRegistry(query);
          if (!cancelled) {
            setResults(found);
            setError(null);
            setFocusIdx(0);
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
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
  }, [query, installing]);

  // Ink's raw-input hook: edit the query, navigate results, trigger install.
  useInput((input, key) => {
    if (installing) {
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setFocusIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setFocusIdx((i) => Math.min(Math.max(0, results.length - 1), i + 1));
      return;
    }
    if (key.return) {
      const focused = results[focusIdx];
      if (focused && !isInstalled(focused)) {
        void runInstall(focused);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return;
    }
    // Plain character typed.
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setQuery((q) => q + input);
    }
  });

  /** Hub's `installed` flag is authoritative, but it can race with our
   *  local list — fall back to the locally-known names too. */
  function isInstalled(r: RegistrySearchResult): boolean {
    return r.installed || (installedNames?.has(r.name) ?? false);
  }

  async function runInstall(pkg: RegistrySearchResult): Promise<void> {
    setInstalling(true);
    setProgress({ phase: 'starting', message: pkg.name });
    try {
      for await (const event of installFromRegistry(pkg.name, pkg.version)) {
        setProgress(event);
        if (event.phase === 'complete') {
          onInstalled();
          return;
        }
        if (event.phase === 'error') {
          setError(event.message ?? 'install failed');
          setInstalling(false);
          return;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInstalling(false);
    }
  }

  if (installing) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold>Installing</Text>
        <Box marginTop={1}>
          <Text>
            <Text color="cyan">{progress?.phase ?? '…'}</Text>
            {progress?.message ? <Text dimColor> · {progress.message}</Text> : null}
          </Text>
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box>
        <Text bold>Install plugin</Text>
        <Text dimColor> · search the registry, ↑↓ + Enter to install, Esc to cancel</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">{'> '}</Text>
        <Text>{query}</Text>
        <Text color="cyan">▏</Text>
        {searching && <Text dimColor> · searching…</Text>}
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        {results.length === 0 && !searching && query.trim().length > 0 && !error && (
          <Text dimColor>no matches</Text>
        )}
        {results.slice(0, 12).map((r, i) => {
          const focused = i === focusIdx;
          return (
            <Box key={`${r.source}:${r.name}`}>
              <Text color={focused ? 'cyan' : undefined}>{focused ? '▸ ' : '  '}</Text>
              <Text bold={focused}>{r.displayName ?? r.name}</Text>
              <Text dimColor> v{r.version}</Text>
              {isInstalled(r) && <Text color="green"> · installed</Text>}
              {!r.compatible && <Text color="yellow"> · incompatible</Text>}
              {r.description && <Text dimColor>{` — ${r.description}`}</Text>}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
