import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher } from '@/lib/query';

export interface RemoteAccessStatus {
  enabled: boolean;
  name: string;
  publicOrigin: string;
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';
  activeSessions: number;
  tokenPresent: boolean;
}

export interface ClaimResponse {
  ok: boolean;
  name: string;
  publicOrigin: string;
}

const QUERY_KEY = ['remote-access', 'status'] as const;

export function useRemoteAccessStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetcher<RemoteAccessStatus>('/api/remote-access/'),
    refetchInterval: 5_000,
  });
}

export function useClaimRemoteAccessName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetcher<ClaimResponse>('/api/remote-access/claim', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useRevokeRemoteAccessToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetcher<{ ok: boolean; removed: boolean }>('/api/remote-access/token', {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
