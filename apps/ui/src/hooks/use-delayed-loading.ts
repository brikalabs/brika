import { useEffect, useRef, useState } from 'react';

interface UseDelayedLoadingOptions {
  /**
   * Delay before showing the loading state (in ms).
   * If loading completes before this time, no skeleton is shown.
   * @default 150
   */
  delay?: number;
  /**
   * Minimum time to show the loading state once it's visible (in ms).
   * Prevents flash effect when loading completes right after skeleton appears.
   * @default 400
   */
  minDuration?: number;
}

/**
 * Hook to manage delayed loading states to avoid flash effects.
 *
 * - If `isLoading` becomes false before `delay`, the skeleton is never shown
 * - Once skeleton is shown, it stays visible for at least `minDuration`
 *
 * @example
 * const { data, isLoading } = useQuery(...);
 * const showSkeleton = useDelayedLoading(isLoading);
 *
 * return showSkeleton ? <Skeleton /> : <Content data={data} />;
 */
export function useDelayedLoading(
  isLoading: boolean,
  options: UseDelayedLoadingOptions = {}
): boolean {
  const { delay = 150, minDuration = 400 } = options;

  const [showLoading, setShowLoading] = useState(false);
  const loadingStartTime = useRef<number | null>(null);
  const delayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Start the delay timer
      delayTimeoutRef.current = setTimeout(() => {
        loadingStartTime.current = Date.now();
        setShowLoading(true);
      }, delay);
    } else {
      // Clear the delay timer if loading finished before delay
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
        delayTimeoutRef.current = null;
      }

      // If loading state was shown, ensure minimum duration
      if (showLoading && loadingStartTime.current) {
        const elapsed = Date.now() - loadingStartTime.current;
        const remaining = minDuration - elapsed;

        if (remaining > 0) {
          minDurationTimeoutRef.current = setTimeout(() => {
            setShowLoading(false);
            loadingStartTime.current = null;
          }, remaining);
        } else {
          setShowLoading(false);
          loadingStartTime.current = null;
        }
      }
    }

    return () => {
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
      if (minDurationTimeoutRef.current) {
        clearTimeout(minDurationTimeoutRef.current);
      }
    };
  }, [isLoading, delay, minDuration, showLoading]);

  return showLoading;
}
