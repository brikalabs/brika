import { Zap } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { Plugin } from '../api';

interface PluginSparksListProps {
  plugin: Plugin;
}

export function PluginSparksList({ plugin }: PluginSparksListProps) {
  const { t, tp } = useLocale();
  const sparks = plugin.sparks ?? [];

  if (sparks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              {t('plugins:details.availableSparks')}
            </CardTitle>
            <CardDescription>{t('plugins:details.availableSparksDesc')}</CardDescription>
          </div>
          <Badge variant="secondary">{sparks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sparks.map((spark) => {
            const sparkKey = spark.id;
            const sparkName = tp(plugin.name, `sparks.${sparkKey}.name`, spark.name || sparkKey);
            const sparkDesc = tp(plugin.name, `sparks.${sparkKey}.description`, spark.description);

            return (
              <div
                key={spark.id}
                className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <Avatar className="size-10 shrink-0 bg-amber-500/20 text-amber-500">
                  <AvatarFallback className="bg-amber-500/20 text-amber-500">
                    <Zap className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{sparkName}</div>
                  {sparkDesc && (
                    <div className="truncate text-muted-foreground text-xs">{sparkDesc}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
