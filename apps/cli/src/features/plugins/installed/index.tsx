import type React from 'react';
import { useState } from 'react';
import { fetchPlugins, type PluginListItem } from '../../../shared/cli/api/plugins';
import { useHubResource } from '../../../shared/hooks/useHubResource';
import { InstalledPluginDetail } from './detail';
import { InstalledList } from './list';

export function InstalledTab(): React.ReactElement {
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
