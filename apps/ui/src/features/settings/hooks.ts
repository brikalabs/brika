/**
 * Settings Hooks
 */

import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/query';
import { fetchAvailableLocales } from './api';

interface SystemResponse {
  version: string;
  runtime: string;
  os: string;
  startedAt: string;
  build: {
    commit: string | null;
    branch: string | null;
    date: string | null;
  };
  repository: string | null;
  paths: {
    root: string;
    config: string;
    data: string;
    plugins: string;
  };
  stats: {
    plugins: { total: number; running: number };
    blocks: { total: number };
    workflows: { total: number; enabled: number };
    sparks: { total: number };
  };
}

export function useAvailableLocales() {
  return useQuery({
    queryKey: ['i18n', 'locales'],
    queryFn: fetchAvailableLocales,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useSystem() {
  return useQuery({
    queryKey: ['system'],
    queryFn: () => fetcher<SystemResponse>('/api/system'),
    staleTime: 1000 * 30, // 30 seconds
  });
}
