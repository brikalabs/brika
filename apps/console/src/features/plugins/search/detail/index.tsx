import { Badge, Button, Properties, Property, ScrollArea } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import {
  fetchRegistryReadme,
  type InstallProgress,
  type RegistrySearchResult,
} from '../../../../shared/cli/api/registry';
import { MarkdownStream } from '../../../../shared/components/MarkdownStream';
import { useReadme } from '../../useReadme';

export function RegistryStatusBadge({
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

export function RegistryReadme({
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
export function RegistryDetail({
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
  // Keyed on `name` (not the full result object) so re-renders that
  // swap an equivalent object don't re-fetch.
  const {
    text: readme,
    loading: readmeLoading,
    error: readmeError,
  } = useReadme(fetchRegistryReadme, item.name);

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
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

      <Box marginTop={1} flexShrink={0}>
        <Button shortcut="escape" autoFocus onPress={onBack}>
          back
        </Button>
        {installed || installing ? null : (
          <Button shortcut="i" variant="success" enabled={item.compatible} onPress={onInstall}>
            install
          </Button>
        )}
      </Box>
    </Box>
  );
}
