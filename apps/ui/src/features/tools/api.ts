import { useQuery } from '@tanstack/react-query';
import { fetcher } from '@/lib/query';

/** A hub-registered tool as served by GET /api/tools (id is `plugin:tool`). */
export interface ToolSummary {
  id: string;
  description?: string;
  icon?: string;
  color?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** Split a qualified tool id into its owning plugin and local name. */
export function splitToolId(id: string): { plugin: string; name: string } {
  const separator = id.lastIndexOf(':');
  if (separator === -1) {
    return { plugin: '', name: id };
  }
  return { plugin: id.slice(0, separator), name: id.slice(separator + 1) };
}

/** Live list of every tool registered across all running plugins. */
export function useTools() {
  return useQuery({
    queryKey: ['tools'],
    queryFn: () => fetcher<ToolSummary[]>('/api/tools'),
    refetchInterval: 10000,
  });
}
