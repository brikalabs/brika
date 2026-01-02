const API_BASE = "/api";

export interface WorkflowTrigger {
  event: string;
  filter?: Record<string, unknown>;
}

export interface WorkflowBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface Workflow {
  id: string;
  name?: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  blocks?: WorkflowBlock[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface BlockDefinition {
  id: string;
  type?: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  inputs: Array<{ id: string; name: string; type?: string }>;
  outputs: Array<{ id: string; name: string; type?: string }>;
  schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// Legacy alias
export type BlockType = BlockDefinition;

export async function fetchWorkflows(): Promise<Workflow[]> {
  const res = await fetch(`${API_BASE}/workflows`);
  return res.json();
}

export async function fetchWorkflow(id: string): Promise<Workflow> {
  const res = await fetch(`${API_BASE}/workflows/${id}`);
  return res.json();
}

export async function fetchBlockTypes(): Promise<BlockDefinition[]> {
  const res = await fetch(`${API_BASE}/blocks`);
  if (!res.ok) throw new Error("Failed to fetch blocks");
  return res.json();
}

export async function fetchWorkflowRuns(): Promise<WorkflowRun[]> {
  const res = await fetch(`${API_BASE}/workflows/runs`);
  return res.json();
}

export async function saveWorkflow(workflow: Workflow): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });
  return res.json();
}

export async function deleteWorkflow(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/workflows/${id}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function triggerWorkflow(id: string, payload?: Record<string, unknown>): Promise<WorkflowRun> {
  const res = await fetch(`${API_BASE}/workflows/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, payload }),
  });
  return res.json();
}

export async function enableWorkflow(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/workflows/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return res.json();
}

export async function disableWorkflow(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/workflows/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return res.json();
}

// Create test workflow event source
export function createTestEventSource(workflowId: string, payload: Record<string, unknown>): EventSource {
  const params = new URLSearchParams({
    id: workflowId,
    payload: JSON.stringify(payload),
  });
  return new EventSource(`${API_BASE}/workflows/test?${params}`);
}
