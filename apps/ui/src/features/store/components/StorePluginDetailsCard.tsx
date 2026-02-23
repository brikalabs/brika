import type { StorePlugin } from '../types';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface StorePluginDetailsCardProps {
  plugin: StorePlugin;
}

export function StorePluginDetailsCard({ plugin }: Readonly<StorePluginDetailsCardProps>) {
  const { t } = useLocale();

  if (!plugin.engines?.brika) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('store:sections.details')}</CardTitle>
        <CardDescription>{t('store:sections.detailsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
          <span className="text-sm">{t('store:labels.packageName')}</span>
          <code className="font-mono text-xs">{plugin.name}</code>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
          <span className="text-sm">{t('store:labels.latestVersion')}</span>
          <code className="font-mono text-xs">{plugin.version}</code>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
          <span className="text-sm">{t('store:labels.brikaCompatibility')}</span>
          <code className="font-mono text-xs">{plugin.engines.brika}</code>
        </div>
        {plugin.license && (
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">{t('store:labels.license')}</span>
            <Badge variant="secondary">{plugin.license}</Badge>
          </div>
        )}
        {plugin.installed && (
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">{t('store:labels.installedVersion')}</span>
            <Badge variant="default" className="font-mono text-xs">
              {plugin.installedVersion}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
