import { Info } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';

interface PluginInstallInfoProps {
  plugin: Plugin;
}

export function PluginInstallInfo({ plugin }: Readonly<PluginInstallInfoProps>) {
  const { t, getLanguageName } = useLocale();
  const locales = plugin.locales ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Info className="size-5 text-primary" />
          {t('plugins:details.installation')}
        </CardTitle>
        <CardDescription>{t('plugins:details.installationDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <InfoRow label={t('plugins:details.uid')} value={plugin.uid} />
        <InfoRow label={t('plugins:details.directory')} value={plugin.rootDirectory} truncate />
        <InfoRow label={t('plugins:details.entryPoint')} value={plugin.entryPoint} truncate />
        <InfoRow label={t('plugins:details.compatibleVersion')} value={plugin.engines.brika} />

        {locales.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">{t('plugins:details.languages')}</span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {locales.map((loc) => (
                <Tooltip key={loc}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {loc}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{getLanguageName(loc)}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {plugin.license && (
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
            <span className="text-sm">{t('plugins:details.license')}</span>
            <Badge variant="secondary">{plugin.license}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  truncate,
}: Readonly<{
  label: string;
  value: string;
  truncate?: boolean;
}>) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5">
      <span className="text-sm">{label}</span>
      <code
        className={`font-mono text-xs ${truncate ? 'max-w-[60%] truncate' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </code>
    </div>
  );
}
