import { Plug } from 'lucide-react';
import { ModuleStatus, PluginModule } from './PluginModule';

interface PluginPageContentProps {
  pluginUid: string;
  pluginName: string;
  pluginStatus: string;
  pageId: string;
  moduleUrl?: string;
}

export function PluginPageContent({
  pluginUid,
  pluginName,
  pluginStatus,
  pageId,
  moduleUrl,
}: Readonly<PluginPageContentProps>) {
  if (pluginStatus !== 'running') {
    return <ModuleStatus icon={Plug} label="Plugin is not running" />;
  }

  // moduleUrl is pre-built by the hub with the content hash in the filename.
  // Fallback to unhashed URL if moduleUrl is not available (plugin just started).
  const url = moduleUrl ?? `/api/plugins/${pluginUid}/pages/${pageId}.js`;

  return (
    <PluginModule
      pluginUid={pluginUid}
      pluginName={pluginName}
      moduleUrl={url}
      scopeId={`${pluginName}:pages/${pageId}`}
    />
  );
}
