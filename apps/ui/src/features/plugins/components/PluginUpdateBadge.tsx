import { useQuery } from '@tanstack/react-query';
import { ArrowUp } from 'lucide-react';
import { Badge } from '@/components/ui';
import { registryApi, registryKeys } from '../registry-api';

interface PluginUpdateBadgeProps {
  packageName: string;
}

export function PluginUpdateBadge({ packageName }: Readonly<PluginUpdateBadgeProps>) {
  const { data } = useQuery({
    queryKey: registryKeys.updates,
    queryFn: () => registryApi.checkUpdates(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const update = data?.updates.find((u) => u.name === packageName);

  if (!update?.updateAvailable) return null;

  return (
    <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-500">
      <ArrowUp className="size-3" />
      {update.currentVersion} → {update.latestVersion}
    </Badge>
  );
}
