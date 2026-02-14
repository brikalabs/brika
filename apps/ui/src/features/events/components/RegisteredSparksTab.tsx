import { useQuery } from '@tanstack/react-query';
import { Plug, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDataView } from '@/components/DataView';
import { Avatar, AvatarFallback, Badge, Card } from '@/components/ui';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import { EmitSparkDialog, type RegisteredSpark } from './EmitSparkDialog';
import { SparkGroupSkeleton } from './SparkCardSkeleton';
import { SparkSchemaViewer } from './SparkSchemaViewer';

function useSparks() {
  return useQuery({
    queryKey: ['sparks'],
    queryFn: () => fetcher<RegisteredSpark[]>('/api/sparks'),
    refetchInterval: 5000,
  });
}

function SparkCard({
  spark,
  pluginId,
  onClick,
}: Readonly<{
  spark: RegisteredSpark;
  pluginId: string;
  onClick: () => void;
}>) {
  const { tp } = useLocale();

  return (
    <Card key={spark.type} interactive className="cursor-pointer p-4" onClick={onClick}>
      <div className="flex items-start gap-3">
        <Avatar className="size-10 bg-amber-500/20">
          <AvatarFallback className="bg-amber-500/20 text-amber-500">
            <Zap className="size-5" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">
            {tp(pluginId, `sparks.${spark.id}.name`, spark.name || spark.id)}
          </div>
          <div className="truncate font-mono text-muted-foreground text-xs">{spark.type}</div>
          {spark.description && (
            <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">
              {tp(pluginId, `sparks.${spark.id}.description`, spark.description)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3">
        <SparkSchemaViewer schema={spark.schema} />
      </div>
    </Card>
  );
}

function SparkPluginGroup({
  pluginId,
  sparks,
  onSelectSpark,
}: Readonly<{
  pluginId: string;
  sparks: RegisteredSpark[];
  onSelectSpark: (spark: RegisteredSpark) => void;
}>) {
  return (
    <div key={pluginId}>
      <div className="mb-3 flex items-center gap-2">
        <Plug className="size-4 text-muted-foreground" />
        <span className="font-mono text-muted-foreground text-sm">{pluginId}</span>
        <Badge variant="secondary" className="text-xs">
          {sparks.length}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sparks.map((spark) => (
          <SparkCard
            key={spark.type}
            spark={spark}
            pluginId={pluginId}
            onClick={() => onSelectSpark(spark)}
          />
        ))}
      </div>
    </div>
  );
}

export function RegisteredSparksTab() {
  const { t } = useLocale();
  const { data: sparks = [], isLoading } = useSparks();
  const [selectedSpark, setSelectedSpark] = useState<RegisteredSpark | null>(null);
  const [emitDialogOpen, setEmitDialogOpen] = useState(false);

  const sparksByPlugin = useMemo(() => {
    const grouped = new Map<string, RegisteredSpark[]>();
    for (const spark of sparks) {
      const existing = grouped.get(spark.pluginId) || [];
      grouped.set(spark.pluginId, [...existing, spark]);
    }
    return grouped;
  }, [sparks]);

  const handleSelectSpark = (spark: RegisteredSpark) => {
    setSelectedSpark(spark);
    setEmitDialogOpen(true);
  };

  const View = useDataView({ data: sparks, isLoading });

  return (
    <>
      <View.Root>
        <View.Skeleton>
          <div className="space-y-6">
            <SparkGroupSkeleton />
            <SparkGroupSkeleton />
          </div>
        </View.Skeleton>

        <View.Empty>
          <div className="py-12 text-center">
            <Zap className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h3 className="font-semibold">{t('sparks:emptyRegistry')}</h3>
            <p className="mt-1 text-muted-foreground">{t('sparks:emptyRegistryHint')}</p>
          </div>
        </View.Empty>

        <View.Content>
          {() => (
            <div className="space-y-6">
              {[...sparksByPlugin.entries()].map(([pluginId, pluginSparks]) => (
                <SparkPluginGroup
                  key={pluginId}
                  pluginId={pluginId}
                  sparks={pluginSparks}
                  onSelectSpark={handleSelectSpark}
                />
              ))}
            </div>
          )}
        </View.Content>
      </View.Root>

      {selectedSpark && (
        <EmitSparkDialog
          spark={selectedSpark}
          open={emitDialogOpen}
          onOpenChange={setEmitDialogOpen}
        />
      )}
    </>
  );
}
