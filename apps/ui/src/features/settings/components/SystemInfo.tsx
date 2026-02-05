/**
 * System Info Component
 *
 * Displays system information including version, runtime, OS, and stats.
 */

import { useDataView } from '@/components/DataView';
import { useSystem } from '../hooks';
import { SystemInfoContent } from './SystemInfoContent';
import { SystemInfoSkeleton } from './SystemInfoSkeleton';

export function SystemInfo() {
  const { data: system, isLoading } = useSystem();

  const View = useDataView({ data: system, isLoading });

  return (
    <View.Root>
      <View.Skeleton>
        <SystemInfoSkeleton />
      </View.Skeleton>

      <View.Content>{(system) => <SystemInfoContent system={system} />}</View.Content>
    </View.Root>
  );
}
