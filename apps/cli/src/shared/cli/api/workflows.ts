/** Workflow summary list — backs the Workflows section + Dashboard tile. */

import { hubFetch } from '../hub-client';

export interface WorkflowSummaryDto {
  readonly id: string;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly state?: 'idle' | 'running' | 'failed';
}

export async function fetchWorkflows(): Promise<WorkflowSummaryDto[]> {
  const res = await hubFetch('/api/workflows');
  if (!res.ok) {
    throw new Error(`workflows fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { workflows?: WorkflowSummaryDto[] } | WorkflowSummaryDto[];
  if (Array.isArray(body)) {
    return [...body];
  }
  return [...(body.workflows ?? [])];
}
