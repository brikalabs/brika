import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from './api';

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: api.fetchWorkflows,
    refetchInterval: 5000,
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ['workflows', id],
    queryFn: () => api.fetchWorkflow(id),
    enabled: !!id,
  });
}

export function useBlockTypes() {
  return useQuery({
    queryKey: ['blocks'],
    queryFn: api.fetchBlockTypes,
    staleTime: 30000,
  });
}

export function useWorkflowRuns() {
  return useQuery({
    queryKey: ['workflows', 'runs'],
    queryFn: api.fetchWorkflowRuns,
    refetchInterval: 2000,
  });
}

export function useTriggerWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: Record<string, unknown> }) =>
      api.triggerWorkflow(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows', 'runs'] }),
  });
}

export function useEnableWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.enableWorkflow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function useDisableWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.disableWorkflow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function useSaveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveWorkflow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteWorkflow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });
}
