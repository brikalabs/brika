import { useParams } from '@tanstack/react-router';
import { usePlugin } from '../hooks';
import { PluginPageContent } from './PluginPageContent';

export function PluginPageTab() {
  const params = useParams({ strict: false });
  const { data: plugin } = usePlugin(params.uid ?? '');

  if (!plugin) return null;

  return (
    <PluginPageContent
      pluginUid={plugin.uid}
      pluginName={plugin.name}
      pluginStatus={plugin.status}
      pageId={params.tab ?? ''}
    />
  );
}
