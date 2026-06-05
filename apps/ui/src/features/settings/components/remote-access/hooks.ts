import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapture } from '@/features/analytics/hooks';
import { fetcher } from '@/lib/query';

export type SignalingState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface RemoteAccessStatus {
  claimed: boolean;
  name: string;
  publicOrigin: string;
  state: SignalingState;
  activeSessions: number;
  coordinatorOrigin: string;
}

export interface ClaimResponse {
  ok: boolean;
  name: string;
  publicOrigin: string;
}

export interface TestCoordinatorResponse {
  ok: boolean;
  status: number;
  coordinatorOrigin: string;
  error?: string;
}

const QUERY_KEY = ['remote-access', 'status'] as const;

export function useRemoteAccessStatus() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetcher<RemoteAccessStatus>('/api/remote-access'),
    refetchInterval: 5_000,
  });
}

export function useClaimRemoteAccessName() {
  const qc = useQueryClient();
  const capture = useCapture();
  return useMutation({
    mutationFn: (name: string) =>
      fetcher<ClaimResponse>('/api/remote-access/claim', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      capture('remote_access.claimed');
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useSetCoordinatorOrigin() {
  const qc = useQueryClient();
  const capture = useCapture();
  return useMutation({
    mutationFn: (coordinatorOrigin: string) =>
      fetcher<{ coordinatorOrigin: string }>('/api/remote-access', {
        method: 'PATCH',
        body: JSON.stringify({ coordinatorOrigin }),
      }),
    onSuccess: () => {
      capture('remote_access.coordinator_set');
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useTestCoordinator() {
  const capture = useCapture();
  return useMutation({
    mutationFn: () =>
      fetcher<TestCoordinatorResponse>('/api/remote-access/test-coordinator', {
        method: 'POST',
      }),
    onSuccess: (result) => {
      capture('remote_access.coordinator_tested', { ok: result.ok });
    },
  });
}

export function useForgetRemoteAccess() {
  const qc = useQueryClient();
  const capture = useCapture();
  return useMutation({
    mutationFn: () =>
      fetcher<{ ok: boolean; removed: boolean; coordinatorReleased: boolean }>(
        '/api/remote-access',
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      capture('remote_access.forgotten');
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
