import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pluginsApi, pluginsKeys } from './api';

export function usePlugins() {
  return useQuery({
    queryKey: pluginsKeys.all,
    queryFn: pluginsApi.list,
  });
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
  const invalidate = () => qc.invalidateQueries({ queryKey: pluginsKeys.all });

  return {
    load: useMutation({ mutationFn: pluginsApi.load, onSuccess: invalidate }),
    enable: useMutation({ mutationFn: pluginsApi.enable, onSuccess: invalidate }),
    disable: useMutation({ mutationFn: pluginsApi.disable, onSuccess: invalidate }),
    reload: useMutation({ mutationFn: pluginsApi.reload, onSuccess: invalidate }),
    kill: useMutation({ mutationFn: pluginsApi.kill, onSuccess: invalidate }),
    uninstall: useMutation({ mutationFn: pluginsApi.uninstall, onSuccess: invalidate }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: pluginsKeys.config(uid) }),
  });
}
