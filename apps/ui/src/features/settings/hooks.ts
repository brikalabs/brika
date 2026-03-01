import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/query';

export interface SystemResponse {
  version: string;
  pid: number;
  runtime: string;
  os: string;
  startedAt: string;
  build: {
    commit: string | null;
    branch: string | null;
    date: string | null;
  };
  repository: string | null;
  paths: {
    root: string;
    config: string;
    data: string;
    plugins: string;
  };
  stats: {
    plugins: {
      total: number;
      running: number;
    };
    blocks: {
      total: number;
    };
    workflows: {
      total: number;
      enabled: number;
    };
    sparks: {
      total: number;
    };
    bricks: {
      total: number;
    };
  };
}

export function useSystem() {
  return useQuery({
    queryKey: ['system'],
    queryFn: () => fetcher<SystemResponse>('/api/system'),
    staleTime: 1000 * 30, // 30 seconds
  });
}
