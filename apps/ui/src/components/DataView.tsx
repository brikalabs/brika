import { type ReactNode, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useDataView()
// ─────────────────────────────────────────────────────────────────────────────

interface UseDataViewOptions<T> {
  data: T | undefined;
  isLoading: boolean;
  isEmpty?: (data: T) => boolean;
}

/**
 * Hook that returns typed DataView components for inline use.
 *
 * @example
 * ```tsx
 * function PluginsPage() {
 *   const { data: plugins, isLoading } = usePlugins();
 *   const View = useDataView({ data: plugins, isLoading });
 *
 *   return (
 *     <View.Root>
 *       <View.Skeleton>
 *         <PluginSkeleton />
 *       </View.Skeleton>
 *
 *       <View.Empty>
 *         <EmptyState />
 *       </View.Empty>
 *
 *       <View.Content>
 *         {(plugins) => <PluginList plugins={plugins} />}
 *       </View.Content>
 *     </View.Root>
 *   );
 * }
 * ```
 */
export function useDataView<T>({ data, isLoading, isEmpty: isEmptyFn }: UseDataViewOptions<T>) {
  return useMemo(() => {
    let computedIsEmpty: boolean;
    if (data === undefined) {
      computedIsEmpty = true;
    } else if (isEmptyFn) {
      computedIsEmpty = isEmptyFn(data);
    } else if (Array.isArray(data)) {
      computedIsEmpty = data.length === 0;
    } else {
      computedIsEmpty = !data;
    }

    // Simple components that use closure over the options
    function Root({
      children,
    }: Readonly<{
      children: ReactNode;
    }>) {
      return <>{children}</>;
    }

    function Skeleton({
      children,
    }: Readonly<{
      children: ReactNode;
    }>) {
      if (!isLoading) {
        return null;
      }
      return <>{children}</>;
    }

    function Empty({
      children,
    }: Readonly<{
      children: ReactNode;
    }>) {
      if (isLoading || !computedIsEmpty) {
        return null;
      }
      return <>{children}</>;
    }

    function Content({
      children,
    }: Readonly<{
      children: (data: T) => ReactNode;
    }>) {
      if (isLoading || computedIsEmpty || data === undefined) {
        return null;
      }
      return <>{children(data)}</>;
    }

    return {
      Root,
      Skeleton,
      Empty,
      Content,
    };
  }, [data, isLoading, isEmptyFn]);
}
