import { Badge, Button, Confirm, ConfirmDescription, ConfirmTitle } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useState } from 'react';
import {
  fetchPluginReadme,
  type PluginListItem,
  pluginAction,
  uninstallPlugin,
} from '../../../../shared/cli/api/plugins';
import { STATUS_VARIANT } from '../../constants';
import { useReadme } from '../../useReadme';
import { PluginMeta } from './PluginMeta';
import { ReadmePane } from './ReadmePane';
import { useLiveMetrics } from './useLiveMetrics';

/**
 * Detail page for one installed plugin. Owns its own README fetch,
 * live metrics polling, action buttons, and uninstall confirmation.
 * Esc / `back` button returns to the list.
 */
export function InstalledPluginDetail({
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
  const {
    text: readme,
    loading: readmeLoading,
    error: readmeError,
  } = useReadme(fetchPluginReadme, plugin.uid);
  const [pendingUninstall, setPendingUninstall] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = (action: 'enable' | 'disable' | 'kill' | 'reload') => () => {
    setActionError(null);
    void pluginAction(plugin.uid, action)
      .then(onRefresh)
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
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

      <Box marginTop={1} flexShrink={0}>
        <Button shortcut="escape" autoFocus onPress={onBack}>
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
    </Box>
  );
}
