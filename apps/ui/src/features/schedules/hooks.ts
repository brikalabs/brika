import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { schedulesApi, schedulesKeys } from "./api";
import type { Schedule } from "@elia/shared";

export function useSchedules() {
  return useQuery({ queryKey: schedulesKeys.all, queryFn: schedulesApi.list });
}

export function useScheduleMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: schedulesKeys.all });

  return {
    create: useMutation({
      mutationFn: (data: Omit<Schedule, "id">) => schedulesApi.create(data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: schedulesApi.delete, onSuccess: invalidate }),
    enable: useMutation({ mutationFn: schedulesApi.enable, onSuccess: invalidate }),
    disable: useMutation({ mutationFn: schedulesApi.disable, onSuccess: invalidate }),
  };
}

