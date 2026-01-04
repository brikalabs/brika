import type { Schedule } from '@brika/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { schedulesApi, schedulesKeys } from './api';

export function useSchedules() {
  return useQuery({ queryKey: schedulesKeys.all, queryFn: schedulesApi.list });
}

export function useScheduleMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: schedulesKeys.all });

  return {
    create: useMutation({
      mutationFn: (data: Omit<Schedule, 'id'>) => schedulesApi.create(data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: schedulesApi.delete, onSuccess: invalidate }),
    enable: useMutation({ mutationFn: schedulesApi.enable, onSuccess: invalidate }),
    disable: useMutation({ mutationFn: schedulesApi.disable, onSuccess: invalidate }),
  };
}
