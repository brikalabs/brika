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

const KNOWN_SOURCES = new Set(['npm', 'local']);

export function StorePluginDetailPage() {
  // Route: /store/$source/$  →  e.g. /store/npm/@brika/plugin-timer
  // Old-format URLs (no source prefix): /store/@brika/blocks-builtin
  //   → TanStack Router matches source='@brika', _splat='blocks-builtin'
  //   → reconstruct full name '@brika/blocks-builtin', pass unprefixed to backend
  const { source, _splat } = useParams({ strict: false });

  const isKnownSource = source ? KNOWN_SOURCES.has(source) : false;
  const packageName = isKnownSource ? (_splat ?? '') : [source, _splat].filter(Boolean).join('/');
  let pluginId = '';
  if (packageName) {
    pluginId = isKnownSource ? `${source}:${packageName}` : packageName;
  }

  const { data: plugin, isLoading } = useStorePluginDetails(pluginId, !!pluginId);
  const { data: readmeData } = useStorePluginReadme(pluginId, !!pluginId);

  const View = useDataView({ data: plugin, isLoading });

  return (
    <View.Root>
      <View.Skeleton>
        <StorePluginDetailSkeleton />
      </View.Skeleton>

      <View.Empty>
        <StorePluginDetailEmpty packageName={packageName ?? ''} />
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
