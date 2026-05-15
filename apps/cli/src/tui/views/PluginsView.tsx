/**
 * Plugins section — two-pane view. Left: list of installed plugins
 * fetched from `/api/plugins`. Right: focused plugin's README rendered
 * inline via the Markdown component, fetched from
 * `/api/plugins/:uid/readme` on selection.
 *
 * Keybinds (local to this section):
 *   ↑ / ↓    move selection
 *   i        open install prompt
 *   e        enable focused plugin
 *   D        disable focused plugin   (Shift+d to avoid colliding with `d`=dashboard)
 *   k        kill focused plugin
 *   R        reload focused plugin
 */

import { useCaptureInput, useKey } from '@brika/tui';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  fetchPluginReadme,
  fetchPlugins,
  type InstallProgress,
  installFromRegistry,
  type PluginListItem,
  pluginAction,
  type RegistrySearchResult,
  searchRegistry,
} from '../../cli/hub-api';
import { Markdown } from '../components/Markdown';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

export function PluginsView(): React.ReactElement {
  const cli = useCli();
  const list = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const [focusIndex, setFocusIndex] = useState(0);
  const [readme, setReadme] = useState<{ uid: string; text: string } | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [installing, setInstalling] = useState(false);

  const items = list.data ?? [];
  const focused = items[focusIndex];

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

  const runAction = (action: 'enable' | 'disable' | 'kill' | 'reload') => () => {
    if (focused) {
      void pluginAction(focused.uid, action)
        .then(list.refresh)
        .catch(() => undefined);
    }
  };

  useKey('upArrow', () => setFocusIndex((i) => Math.max(0, i - 1)), !installing);
  useKey(
    'downArrow',
    () => setFocusIndex((i) => Math.min(items.length - 1, i + 1)),
    !installing && items.length > 0
  );
  useKey('i', () => setInstalling(true), !installing);
  useKey('e', runAction('enable'), !installing && Boolean(focused));
  useKey('D', runAction('disable'), !installing && Boolean(focused));
  useKey('k', runAction('kill'), !installing && Boolean(focused));
  useKey('R', runAction('reload'), !installing && Boolean(focused));

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Plugins" />;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Plugins </Text>
        <Text dimColor>{items.length}</Text>
        {list.loading && <Text dimColor> · loading…</Text>}
        {list.error && <Text color="red"> · {list.error}</Text>}
      </Box>

      {installing && (
        <Box marginBottom={1}>
          <SearchInstall
            onClose={() => setInstalling(false)}
            onInstalled={() => {
              setInstalling(false);
              list.refresh();
            }}
          />
        </Box>
      )}

      <Box>
        <Box flexDirection="column" minWidth={28} marginRight={2}>
          {items.length === 0 ? (
            <Text dimColor>(no plugins yet — press i to install)</Text>
          ) : (
            items.map((p, i) => (
              <Box key={p.uid}>
                <Text color={i === focusIndex ? 'cyan' : undefined}>
                  {i === focusIndex ? '▸ ' : '  '}
                </Text>
                <Text bold={i === focusIndex}>{p.displayName ?? p.name}</Text>
                <Text dimColor> v{p.version}</Text>
                <Text dimColor>{p.enabled ? '' : ' · off'}</Text>
              </Box>
            ))
          )}
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          <ReadmePane
            hasFocus={Boolean(focused)}
            loading={readmeLoading}
            error={readmeError}
            text={readme?.text ?? null}
          />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ select · i install · e enable · D disable · R reload · k kill</Text>
      </Box>
    </Box>
  );
}

interface ReadmePaneProps {
  readonly hasFocus: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly text: string | null;
}

function ReadmePane({
  hasFocus,
  loading,
  error,
  text,
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
  if (text) {
    return <Markdown source={text} />;
  }
  return <Text dimColor>no readme</Text>;
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
}

function SearchInstall({ onClose, onInstalled }: Readonly<SearchInstallProps>): React.ReactElement {
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
      if (focused && !focused.installed) {
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
              {r.installed && <Text color="green"> · installed</Text>}
              {!r.compatible && <Text color="yellow"> · incompatible</Text>}
              {r.description && <Text dimColor>{` — ${r.description}`}</Text>}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
