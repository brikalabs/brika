import { useEffect, useState } from 'react';

/**
 * Debounce a value by a specified delay.
 * Useful for search inputs to avoid excessive API calls.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebouncedValue(search, 300);
 *
 * // Use debouncedSearch in your query
 * const { data } = useStorePlugins({ q: debouncedSearch });
 * ```
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Combined state + debounce hook.
 * Returns [debouncedValue, setValue] - use for uncontrolled inputs.
 *
 * @example
 * ```tsx
 * const [debouncedSearch, setSearch] = useDebouncedState('', 300);
 *
 * <Input defaultValue="" onChange={(e) => setSearch(e.target.value)} />
 * const { data } = useQuery({ q: debouncedSearch });
 * ```
 */
export function useDebouncedState<T>(
  initialValue: T,
  delay = 300
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebouncedValue(value, delay);

  return [debouncedValue, setValue];
}

/**
 * Returns a debounced callback function.
 * The callback will only execute after the specified delay has passed
 * without any new invocations.
 *
 * @example
 * ```tsx
 * const handleSearch = useDebouncedCallback((query: string) => {
 *   console.log('Searching for:', query);
 * }, 300);
 * ```
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay = 300
): T {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [timer]);

  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => callback(...args), delay));
  }) as T;
}
