import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, usersKeys } from './api';

export function useUsers() {
  return useQuery({
    queryKey: usersKeys.all,
    queryFn: usersApi.list,
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: usersKeys.all });

  return {
    create: useMutation({
      mutationFn: usersApi.create,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string; name?: string; role?: string; isActive?: boolean; scopes?: string[] }) =>
        usersApi.update(id, data),
      onSuccess: invalidate,
    }),
    delete: useMutation({
      mutationFn: usersApi.delete,
      onSuccess: invalidate,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, password }: { id: string; password: string }) =>
        usersApi.resetPassword(id, password),
      onSuccess: invalidate,
    }),
  };
}
