import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapture } from '@/features/analytics/hooks';
import { fetcher } from '@/lib/query';

/** One registry definition, mirroring the hub's `RegistryDescriptor` (`/api/registry/registries`). */
export interface RegistryDescriptor {
  id: string;
  name: string;
  pluginUrl?: string;
  search?: { type: 'npm' | 'v1'; url?: string };
  install?: { registry?: string };
  readme?: { type: 'v1' | 'unpkg' };
  default?: boolean;
}

/** The `GET /api/registry/registries` payload: the catalogue plus the runtime routing state. */
export interface RegistriesConfig {
  defaultRegistry?: string;
  npmRegistries: Record<string, string>;
  searchStores: string[];
  registries: RegistryDescriptor[];
}

const QUERY_KEY = ['registries'] as const;

export function useRegistries() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetcher<RegistriesConfig>('/api/registry/registries'),
  });
}

/** Add (or re-route) a scope's install registry, optionally registering a `/v1` search store too. */
export function useAddRegistry() {
  const qc = useQueryClient();
  const capture = useCapture();
  return useMutation({
    mutationFn: (body: { scope: string; registry: string; store?: string }) =>
      fetcher<RegistriesConfig>('/api/registry/registries', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      capture('settings.registry_added', { withStore: variables.store !== undefined });
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
