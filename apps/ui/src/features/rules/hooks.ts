import type { Rule } from '@brika/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rulesApi, rulesKeys } from './api';

export function useRules() {
  return useQuery({ queryKey: rulesKeys.all, queryFn: rulesApi.list });
}

export function useRuleMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: rulesKeys.all });

  return {
    create: useMutation({
      mutationFn: (data: Omit<Rule, 'id'>) => rulesApi.create(data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: rulesApi.delete, onSuccess: invalidate }),
    enable: useMutation({ mutationFn: rulesApi.enable, onSuccess: invalidate }),
    disable: useMutation({ mutationFn: rulesApi.disable, onSuccess: invalidate }),
  };
}
