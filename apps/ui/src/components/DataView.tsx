import { createContext, type ReactNode, useContext, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DataViewContextValue<T> {
  data: T | undefined;
  isLoading: boolean;
  isEmpty: boolean;
}

export interface DataViewRootProps<T> {
  data: T | undefined;
  isLoading: boolean;
  isEmpty?: (data: T) => boolean;
  children: ReactNode;
}

export interface DataViewContentProps<T> {
  children: (data: T) => ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: createDataView<T>()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a typed DataView component set for a specific data type.
 *
 * @example
 * ```tsx
 * // Create typed components (do this once, outside component)
 * const PluginView = createDataView<Plugin[]>();
 *
 * // Use in component
 * function PluginsPage() {
 *   const { data, isLoading } = usePlugins();
 *
 *   return (
 *     <PluginView.Root data={data} isLoading={isLoading}>
 *       <PluginView.Skeleton>
 *         <PluginSkeleton count={4} />
 *       </PluginView.Skeleton>
 *
 *       <PluginView.Empty>
 *         <EmptyState />
 *       </PluginView.Empty>
 *
 *       <PluginView.Content>
 *         {(plugins) => (  // ✅ plugins is typed as Plugin[]
 *           <PluginList plugins={plugins} />
 *         )}
 *       </PluginView.Content>
 *     </PluginView.Root>
 *   );
 * }
 * ```
 */
export function createDataView<T>() {
  const Context = createContext<DataViewContextValue<T> | null>(null);

  function useDataViewContext() {
    const context = useContext(Context);
    if (!context) {
      throw new Error('DataView components must be used within DataView.Root');
    }
    return context;
  }

  function Root({ data, isLoading, isEmpty: isEmptyFn, children }: DataViewRootProps<T>) {
    const isEmpty = useMemo(() => {
      if (data === undefined) return true;
      if (isEmptyFn) return isEmptyFn(data);
      if (Array.isArray(data)) return data.length === 0;
      return !data;
    }, [data, isEmptyFn]);

    return <Context.Provider value={{ data, isLoading, isEmpty }}>{children}</Context.Provider>;
  }

  function Skeleton({ children }: { children: ReactNode }) {
    const { isLoading } = useDataViewContext();
    if (!isLoading) return null;
    return <>{children}</>;
  }

  function Empty({ children }: { children: ReactNode }) {
    const { isLoading, isEmpty } = useDataViewContext();
    if (isLoading || !isEmpty) return null;
    return <>{children}</>;
  }

  function Content({ children }: DataViewContentProps<T>) {
    const { data, isLoading, isEmpty } = useDataViewContext();
    if (isLoading || isEmpty || data === undefined) return null;
    return <>{children(data)}</>;
  }

  return { Root, Skeleton, Empty, Content };
}

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
    const computedIsEmpty =
      data === undefined ||
      (isEmptyFn ? isEmptyFn(data) : Array.isArray(data) ? data.length === 0 : !data);

    // Simple components that use closure over the options
    function Root({ children }: { children: ReactNode }) {
      return <>{children}</>;
    }

    function Skeleton({ children }: { children: ReactNode }) {
      if (!isLoading) return null;
      return <>{children}</>;
    }

    function Empty({ children }: { children: ReactNode }) {
      if (isLoading || !computedIsEmpty) return null;
      return <>{children}</>;
    }

    function Content({ children }: { children: (data: T) => ReactNode }) {
      if (isLoading || computedIsEmpty || data === undefined) return null;
      return <>{children(data)}</>;
    }

    return { Root, Skeleton, Empty, Content };
  }, [data, isLoading, isEmptyFn]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export for simple cases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-created DataView for unknown/any types.
 * For better type safety, use createDataView<T>() instead.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: intentional name for component pattern
export const DataView = createDataView<unknown>(); // NOSONAR — intentional shadowing of global DataView
