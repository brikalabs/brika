import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapture } from '@/features/analytics/hooks';
import { usersApi, usersKeys } from './api';

export function useUsers() {
  return useQuery({
    queryKey: usersKeys.all,
    queryFn: usersApi.list,
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const capture = useCapture();
  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: usersKeys.all,
    });

  return {
    create: useMutation({
      mutationFn: usersApi.create,
      onSuccess: () => {
        // No PII in props — the event itself is the signal.
        capture('user.created');
        invalidate();
      },
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...data
      }: {
        id: string;
        name?: string;
        role?: string;
        isActive?: boolean;
        scopes?: string[];
      }) => usersApi.update(id, data),
      onSuccess: (_data, { id }) => {
        capture('user.updated', { userId: id });
        invalidate();
      },
    }),
    delete: useMutation({
      mutationFn: usersApi.delete,
      onSuccess: (_data, id) => {
        capture('user.deleted', { userId: id });
        invalidate();
      },
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, password }: { id: string; password: string }) =>
        usersApi.resetPassword(id, password),
      onSuccess: (_data, { id }) => {
        capture('user.password_reset', { userId: id });
        invalidate();
      },
    }),
  };
}
