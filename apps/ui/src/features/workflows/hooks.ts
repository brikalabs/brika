import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Tools Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useTools() {
  return useQuery({
    queryKey: [
      'tools',
    ],
    queryFn: api.fetchTools,
    staleTime: 30000,
  });
}

export function useToolSchema(toolId: string | null) {
  return useQuery({
    queryKey: [
      'tools',
      toolId,
      'schema',
    ],
    queryFn: () => api.fetchToolSchema(toolId ?? ''),
    enabled: !!toolId,
    staleTime: 60000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useWorkflows() {
  return useQuery({
    queryKey: [
      'workflows',
    ],
    queryFn: api.fetchWorkflows,
    refetchInterval: 5000,
  });
}

export function useWorkflow(
  id: string,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: [
      'workflows',
      id,
    ],
    queryFn: () => api.fetchWorkflow(id),
    enabled: options?.enabled ?? !!id,
  });
}

export function useBlockTypes() {
  return useQuery({
    queryKey: [
      'blocks',
    ],
    queryFn: api.fetchBlockTypes,
    staleTime: 30000,
  });
}

export function useWorkflowRuns() {
  return useQuery({
    queryKey: [
      'workflows',
      'runs',
    ],
    queryFn: api.fetchWorkflowRuns,
    refetchInterval: 2000,
  });
}

export function useEnableWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.enableWorkflow,
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: [
          'workflows',
        ],
      }),
  });
}

export function useDisableWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.disableWorkflow,
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: [
          'workflows',
        ],
      }),
  });
}

export function useSaveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveWorkflow,
    onSuccess: (_data, workflow) => {
      // Invalidate all workflow queries to ensure fresh data
      qc.invalidateQueries({
        queryKey: [
          'workflows',
        ],
      });
      // Also invalidate the specific workflow query
      qc.invalidateQueries({
        queryKey: [
          'workflows',
          workflow.id,
        ],
      });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteWorkflow,
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: [
          'workflows',
        ],
      }),
  });
}
