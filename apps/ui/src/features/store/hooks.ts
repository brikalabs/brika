import { useQuery } from '@tanstack/react-query';
import { storeApi, storeKeys } from './api';

export function useStorePlugins(params: { q?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: storeKeys.search(params),
    queryFn: () => storeApi.search(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useVerifiedPlugins() {
  return useQuery({
    queryKey: storeKeys.verified,
    queryFn: storeApi.getVerified,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useStorePluginDetails(name: string, enabled = true) {
  return useQuery({
    queryKey: storeKeys.plugin(name),
    queryFn: () => storeApi.getPluginDetails(name),
    enabled,
  });
}

export function useStorePluginReadme(name: string, enabled = true) {
  return useQuery({
    queryKey: storeKeys.readme(name),
    queryFn: () => storeApi.getPluginReadme(name),
    enabled,
  });
}

export function useLocalPlugins(params: { q?: string }) {
  return useQuery({
    queryKey: storeKeys.localPlugins(params),
    queryFn: () => storeApi.getLocalPlugins(params),
    staleTime: 30 * 1000, // 30 seconds — local FS changes frequently during dev
  });
}

export function useBrikaVersion() {
  return useQuery({
    queryKey: storeKeys.version,
    queryFn: storeApi.getCurrentVersion,
    staleTime: Number.POSITIVE_INFINITY, // Version doesn't change during runtime
  });
}
