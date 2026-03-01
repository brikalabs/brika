import { useDataView } from '@/components/DataView';
import { useSystem } from '../../hooks';
import { Content } from './Content';
import { SystemInfoSkeleton } from './skeleton';

export function SystemInfo() {
  const { data: system, isLoading } = useSystem();

  const View = useDataView({
    data: system,
    isLoading,
  });

  return (
    <View.Root>
      <View.Skeleton>
        <SystemInfoSkeleton />
      </View.Skeleton>

      <View.Content>{(system) => <Content system={system} />}</View.Content>
    </View.Root>
  );
}
