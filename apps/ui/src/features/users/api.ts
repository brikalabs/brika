import { fetcher } from '@/lib/query';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarHash: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  scopes: string[];
}

export const usersApi = {
  list: () =>
    fetcher<{
      users: UserRecord[];
    }>('/api/users'),

  create: (data: { email: string; name: string; role: string; password: string }) =>
    fetcher<{
      user: UserRecord;
    }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      name?: string;
      role?: string;
      isActive?: boolean;
      scopes?: string[];
    }
  ) =>
    fetcher<{
      user: UserRecord;
    }>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetcher<{
      ok: boolean;
    }>(`/api/users/${id}`, {
      method: 'DELETE',
    }),

  resetPassword: (id: string, password: string) =>
    fetcher<{
      ok: boolean;
    }>(`/api/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({
        password,
      }),
    }),
};

export const usersKeys = {
  all: [
    'users',
  ] as const,
  detail: (id: string) =>
    [
      'users',
      id,
    ] as const,
};
