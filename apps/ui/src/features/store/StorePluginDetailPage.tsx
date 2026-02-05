import { useParams } from '@tanstack/react-router';
import { useDataView } from '@/components/DataView';
import {
  StorePluginDetailEmpty,
  StorePluginDetailSkeleton,
  StorePluginDetailsCard,
  StorePluginHeader,
  StorePluginReadmeCard,
} from './components';
import { useStorePluginDetails, useStorePluginReadme } from './hooks';

export function StorePluginDetailPage() {
  const { name } = useParams({ strict: false });

  // Decode the package name from URL
  const packageName = name ? decodeURIComponent(name) : '';
  const { data: plugin, isLoading } = useStorePluginDetails(packageName, !!packageName);
  const { data: readmeData } = useStorePluginReadme(packageName, !!packageName);

  const View = useDataView({ data: plugin, isLoading });

  return (
    <View.Root>
      <View.Skeleton>
        <StorePluginDetailSkeleton />
      </View.Skeleton>

      <View.Empty>
        <StorePluginDetailEmpty packageName={packageName} />
      </View.Empty>

      <View.Content>
        {(plugin) => (
          <div className="space-y-6">
            <StorePluginHeader plugin={plugin} />
            <StorePluginDetailsCard plugin={plugin} />
            {readmeData?.readme && (
              <StorePluginReadmeCard readme={readmeData.readme} filename={readmeData.filename} />
            )}
          </div>
        )}
      </View.Content>
    </View.Root>
  );
}
