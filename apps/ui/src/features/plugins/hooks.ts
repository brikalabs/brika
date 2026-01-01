import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pluginsApi, pluginsKeys } from "./api";

export function usePlugins() {
  return useQuery({
    queryKey: pluginsKeys.all,
    queryFn: pluginsApi.list,
  });
}

export function usePlugin(id: string) {
  return useQuery({
    queryKey: pluginsKeys.detail(id),
    queryFn: () => pluginsApi.getById(id),
    enabled: !!id,
  });
}

export function usePluginMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: pluginsKeys.all });

  return {
    enable: useMutation({ mutationFn: pluginsApi.enable, onSuccess: invalidate }),
    disable: useMutation({ mutationFn: pluginsApi.disable, onSuccess: invalidate }),
    reload: useMutation({ mutationFn: pluginsApi.reload, onSuccess: invalidate }),
    kill: useMutation({ mutationFn: pluginsApi.kill, onSuccess: invalidate }),
  };
}

