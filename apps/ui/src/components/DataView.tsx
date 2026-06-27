import { type ReactNode, useMemo, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Hook: useDataView()
// ─────────────────────────────────────────────────────────────────────────────

interface UseDataViewOptions<T> {
  data: T | undefined;
  isLoading: boolean;
  isEmpty?: (data: T) => boolean;
}

/** Whether `data` should render the empty state. */
function computeIsEmpty<T>(data: T | undefined, isEmpty?: (data: T) => boolean): boolean {
  if (data === undefined) {
    return true;
  }
  if (isEmpty) {
    return isEmpty(data);
  }
  if (Array.isArray(data)) {
    return data.length === 0;
  }
  return !data;
}

/**
 * Hook that returns typed DataView slot components for inline use.
 *
 * The slot components keep **stable identities** across renders: they read the latest state through a
 * ref instead of closing over `data`/`isLoading` (which a refetch changes on every call). Rebuilding
 * them per render (the naive approach) makes React see a new component type at `<View.Content>` and
 * remount the whole content subtree on each refetch, tearing down anything stateful inside it (an open
 * install/update dialog on a card, scroll position, focus). With stable identities the content
 * re-renders in place and reconciles its children by key instead.
 *
 * @example
 * ```tsx
 * const { data: plugins, isLoading } = usePlugins();
 * const View = useDataView({ data: plugins, isLoading });
 *
 * return (
 *   <View.Root>
 *     <View.Skeleton><PluginSkeleton /></View.Skeleton>
 *     <View.Empty><EmptyState /></View.Empty>
 *     <View.Content>{(plugins) => <PluginList plugins={plugins} />}</View.Content>
 *   </View.Root>
 * );
 * ```
 */
export function useDataView<T>({ data, isLoading, isEmpty }: UseDataViewOptions<T>) {
  const state = useRef({ data, isLoading, empty: false });
  state.current = { data, isLoading, empty: computeIsEmpty(data, isEmpty) };

  return useMemo(() => {
    function Root({ children }: Readonly<{ children: ReactNode }>) {
      return <>{children}</>;
    }

    function Skeleton({ children }: Readonly<{ children: ReactNode }>) {
      return state.current.isLoading ? <>{children}</> : null;
    }

    function Empty({ children }: Readonly<{ children: ReactNode }>) {
      const { isLoading, empty } = state.current;
      return !isLoading && empty ? <>{children}</> : null;
    }

    function Content({ children }: Readonly<{ children: (data: T) => ReactNode }>) {
      const { data, isLoading, empty } = state.current;
      return isLoading || empty || data === undefined ? null : <>{children(data)}</>;
    }

    return { Root, Skeleton, Empty, Content };
    // Built once: the slots close over the `state` ref, never over `data`/`isLoading` directly.
  }, []);
}
