import { Avatar, AvatarFallback, Card } from '@brika/clay';
import { Boxes, Clock, Hash } from 'lucide-react';
import { Uptime } from '@/components/Uptime';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';

interface PluginStatsProps {
  plugin: Plugin;
}

export function PluginStats({ plugin }: Readonly<PluginStatsProps>) {
  const { t, formatTime } = useLocale();
  const blocksCount = plugin.blocks?.length ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card accent="violet" className="p-5">
        <div className="relative flex h-full flex-col justify-center">
          <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <Boxes className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="font-bold text-3xl tracking-tight">{blocksCount}</div>
          <div className="mt-1 text-muted-foreground text-sm">{t('workflows:blocks')}</div>
        </div>
      </Card>

      <Card accent="blue" className="p-5">
        <div className="relative flex h-full flex-col justify-center">
          <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <Hash className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="font-bold font-mono text-3xl tracking-tight">{plugin.pid ?? '-'}</div>
          <div className="mt-1 text-muted-foreground text-sm">{t('plugins:details.pid')}</div>
        </div>
      </Card>

      <Card accent="orange" className="p-5">
        <div className="relative flex h-full flex-col justify-center">
          <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <Clock className="size-4" />
            </AvatarFallback>
          </Avatar>
          <Uptime startedAt={plugin.startedAt} className="font-bold text-3xl tracking-tight" />
          <div className="mt-1 text-muted-foreground text-sm">
            {plugin.startedAt ? (
              <>
                {t('plugins:details.startedAt')} {formatTime(plugin.startedAt)}
              </>
            ) : (
              t('plugins:details.uptime')
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
