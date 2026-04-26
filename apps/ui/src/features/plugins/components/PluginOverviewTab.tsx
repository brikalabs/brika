import { Badge, Card, CardContent, CardHeader, CardTitle } from '@brika/clay';
import { useParams } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { usePlugin, usePluginMetrics, usePluginReadme } from '../hooks';
import { Markdown } from './Markdown';
import { PluginBlocksList } from './PluginBlocksList';
import { PluginBricksList } from './PluginBricksList';
import { PluginConfigForm } from './PluginConfigForm';
import { PluginInstallInfo } from './PluginInstallInfo';
import { PluginMetrics } from './PluginMetrics';
import { PluginPermissions } from './PluginPermissions';
import { PluginSparksList } from './PluginSparksList';
import { PluginStats } from './PluginStats';

export function PluginOverviewTab() {
  const params = useParams({
    strict: false,
  });
  const { data: plugin } = usePlugin(params.uid ?? '');
  const { data: readmeData } = usePluginReadme(params.uid ?? '');
  const { data: metrics } = usePluginMetrics(params.uid ?? '', plugin?.status === 'running');
  const { t } = useLocale();

  if (!plugin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PluginStats plugin={plugin} />
      <PluginMetrics metrics={metrics} />
      <PluginBlocksList plugin={plugin} />
      <PluginSparksList plugin={plugin} />
      <PluginBricksList plugin={plugin} />
      <PluginConfigForm pluginUid={plugin.uid} pluginName={plugin.name} />
      <PluginPermissions plugin={plugin} />
      <PluginInstallInfo plugin={plugin} />

      {readmeData?.readme && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              {t('plugins:details.readme')}
              <Badge variant="outline" className="ml-auto font-mono text-xs">
                {readmeData.filename}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{readmeData.readme}</Markdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
