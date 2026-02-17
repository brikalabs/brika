import { Plug } from 'lucide-react';
import { ModuleStatus, PluginModule } from './PluginModule';

interface PluginPageContentProps {
  pluginUid: string;
  pluginName: string;
  pluginStatus: string;
  pageId: string;
}

export function PluginPageContent({
  pluginUid,
  pluginName,
  pluginStatus,
  pageId,
}: Readonly<PluginPageContentProps>) {
  if (pluginStatus !== 'running') {
    return <ModuleStatus icon={Plug} label="Plugin is not running" />;
  }

  return (
    <PluginModule
      pluginUid={pluginUid}
      pluginName={pluginName}
      moduleUrl={`/api/plugins/${pluginUid}/pages/${pageId}/module.js`}
    />
  );
}
