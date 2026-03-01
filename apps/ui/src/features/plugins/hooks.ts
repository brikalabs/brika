import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { pluginsApi, pluginsKeys } from './api';
import { registryApi, registryKeys, type UpdateInfo } from './registry-api';

export function usePlugins() {
  return useQuery({
    queryKey: pluginsKeys.all,
    queryFn: pluginsApi.list,
  });
}

/** Centralized hook for plugin update checks */
export function usePluginUpdates() {
  const query = useQuery({
    queryKey: registryKeys.updates,
    queryFn: () => registryApi.checkUpdates(),
    staleTime: 5 * 60 * 1000,
  });

  const updates = query.data?.updates ?? [];
  const available = useMemo(() => updates.filter((u) => u.updateAvailable), [updates]);
  const updateMap = useMemo(() => new Map(updates.map((u) => [u.name, u])), [updates]);

  return {
    ...query,
    updates,
    available,
    updateMap,
    getUpdate: (packageName: string): UpdateInfo | undefined => updateMap.get(packageName),
    hasUpdates: available.length > 0,
    count: available.length,
  };
}

export function usePlugin(uid: string) {
  return useQuery({
    queryKey: pluginsKeys.detail(uid),
    queryFn: () => pluginsApi.getByUid(uid),
    enabled: !!uid,
  });
}

export function usePluginReadme(uid: string) {
  return useQuery({
    queryKey: pluginsKeys.readme(uid),
    queryFn: () => pluginsApi.getReadme(uid),
    enabled: !!uid,
  });
}

export function usePluginMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: pluginsKeys.all,
    });

  return {
    load: useMutation({
      mutationFn: pluginsApi.load,
      onSuccess: invalidate,
    }),
    enable: useMutation({
      mutationFn: pluginsApi.enable,
      onSuccess: invalidate,
    }),
    disable: useMutation({
      mutationFn: pluginsApi.disable,
      onSuccess: invalidate,
    }),
    reload: useMutation({
      mutationFn: pluginsApi.reload,
      onSuccess: invalidate,
    }),
    kill: useMutation({
      mutationFn: pluginsApi.kill,
      onSuccess: invalidate,
    }),
    uninstall: useMutation({
      mutationFn: pluginsApi.uninstall,
      onSuccess: invalidate,
    }),
  };
}

export function usePluginConfig(uid: string) {
  return useQuery({
    queryKey: pluginsKeys.config(uid),
    queryFn: () => pluginsApi.getConfig(uid),
    enabled: !!uid,
  });
}

export function usePluginConfigMutation(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) => pluginsApi.setConfig(uid, config),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: pluginsKeys.config(uid),
      }),
  });
}

export function useTogglePermission(uid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ permission, granted }: { permission: string; granted: boolean }) =>
      pluginsApi.togglePermission(uid, permission, granted),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: pluginsKeys.detail(uid),
      }),
  });
}

export function usePluginMetrics(uid: string, enabled = true) {
  return useQuery({
    queryKey: pluginsKeys.metrics(uid),
    queryFn: () => pluginsApi.getMetrics(uid),
    refetchInterval: 5000,
    enabled: enabled && !!uid,
  });
}
