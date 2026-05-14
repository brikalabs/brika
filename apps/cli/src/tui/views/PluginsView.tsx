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

import { Form, FormField, FormInput, useKey } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  fetchPluginReadme,
  fetchPlugins,
  loadPlugin,
  type PluginListItem,
  pluginAction,
} from '../../cli/hub-api';
import { Markdown } from '../components/Markdown';
import { useCli } from '../useCli';
import { useHubResource } from '../useHubResource';

const requireSource = (v: string | boolean): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? null : 'source is required';

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

  useKey('upArrow', () => setFocusIndex((i) => Math.max(0, i - 1)), !installing);
  useKey(
    'downArrow',
    () => setFocusIndex((i) => Math.min(items.length - 1, i + 1)),
    !installing && items.length > 0
  );
  useKey('i', () => setInstalling(true), !installing);
  useKey(
    'e',
    () => {
      if (focused) {
        void pluginAction(focused.uid, 'enable')
          .then(list.refresh)
          .catch(() => undefined);
      }
    },
    !installing && Boolean(focused)
  );
  useKey(
    'D',
    () => {
      if (focused) {
        void pluginAction(focused.uid, 'disable')
          .then(list.refresh)
          .catch(() => undefined);
      }
    },
    !installing && Boolean(focused)
  );
  useKey(
    'k',
    () => {
      if (focused) {
        void pluginAction(focused.uid, 'kill')
          .then(list.refresh)
          .catch(() => undefined);
      }
    },
    !installing && Boolean(focused)
  );
  useKey(
    'R',
    () => {
      if (focused) {
        void pluginAction(focused.uid, 'reload')
          .then(list.refresh)
          .catch(() => undefined);
      }
    },
    !installing && Boolean(focused)
  );

  if (cli.hub.state !== 'running') {
    return <NotConnected />;
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
          <Form
            title="Install plugin"
            subtitle="paste a registry name or URL"
            onSubmit={async (values) => {
              await loadPlugin(String(values.source));
              setInstalling(false);
              list.refresh();
            }}
            onCancel={() => setInstalling(false)}
          >
            <FormField name="source" label="Source" validate={requireSource}>
              <FormInput placeholder="@brika/plugin-timer or https://…" />
            </FormField>
          </Form>
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

function NotConnected(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Plugins</Text>
      <Box marginTop={1}>
        <Text dimColor>hub isn't running — </Text>
        <Text color="yellow">Ctrl+S</Text>
        <Text dimColor> to start it.</Text>
      </Box>
    </Box>
  );
}
