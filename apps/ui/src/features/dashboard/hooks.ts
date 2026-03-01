import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/query';

interface HealthResponse {
  ok: boolean;
  version: string;
}

export function useHealth() {
  return useQuery({
    queryKey: [
      'health',
    ],
    queryFn: () => fetcher<HealthResponse>('/api/health'),
    refetchInterval: 5000,
  });
}
