import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCapture } from '@/features/analytics/hooks';
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
  const capture = useCapture();
  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: pluginsKeys.all,
    });
  const onSuccess = (event: string) => (_data: unknown, target: string) => {
    capture(event, { target });
    invalidate();
  };

  return {
    load: useMutation({
      mutationFn: pluginsApi.load,
      onSuccess: onSuccess('plugin.loaded'),
    }),
    enable: useMutation({
      mutationFn: pluginsApi.enable,
      onSuccess: onSuccess('plugin.enabled'),
    }),
    disable: useMutation({
      mutationFn: pluginsApi.disable,
      onSuccess: onSuccess('plugin.disabled'),
    }),
    reload: useMutation({
      mutationFn: pluginsApi.reload,
      onSuccess: onSuccess('plugin.reloaded'),
    }),
    kill: useMutation({
      mutationFn: pluginsApi.kill,
      onSuccess: onSuccess('plugin.killed'),
    }),
    uninstall: useMutation({
      mutationFn: pluginsApi.uninstall,
      onSuccess: onSuccess('plugin.uninstalled'),
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
  const capture = useCapture();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) => pluginsApi.setConfig(uid, config),
    onSuccess: () => {
      capture('plugin.config_updated', { uid });
      qc.invalidateQueries({
        queryKey: pluginsKeys.config(uid),
      });
    },
  });
}

export function useTogglePermission(uid: string) {
  const qc = useQueryClient();
  const capture = useCapture();
  return useMutation({
    mutationFn: ({ permission, granted }: { permission: string; granted: boolean }) =>
      pluginsApi.togglePermission(uid, permission, granted),
    onSuccess: (_data, { permission, granted }) => {
      capture('plugin.permission_toggled', { uid, permission, granted });
      qc.invalidateQueries({
        queryKey: pluginsKeys.detail(uid),
      });
    },
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
