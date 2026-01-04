/**
 * Settings Hooks
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAvailableLocales } from './api';

export function useAvailableLocales() {
  return useQuery({
    queryKey: ['i18n', 'locales'],
    queryFn: fetchAvailableLocales,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
