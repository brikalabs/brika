const API_BASE = '/api';

export type WorkflowStatus = 'running' | 'stopped' | 'error';

export interface WorkflowConnection {
  from: string;
  fromPort?: string;
  to: string;
  toPort?: string;
}

export interface WorkflowBlock {
  id: string;
  type: string;
  position?: {
    x: number;
    y: number;
  };
  config?: Record<string, unknown>;

  [key: string]: unknown;
}

export interface Workflow {
  id: string;
  name?: string;
  enabled: boolean;
  status?: WorkflowStatus;
  error?: string;
  startedAt?: number;
  blocks?: WorkflowBlock[];
  connections?: WorkflowConnection[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  finishedAt?: number;
  error?: string;
  triggerBlockId?: string;
  eventCount?: number;
}

export interface RunEvent {
  id: number;
  ts: number;
  kind: string;
  blockId?: string;
  port?: string;
  data?: unknown;
  level?: string;
  message?: string;
  causationId?: string;
}

export interface WorkflowRunDetail {
  run: WorkflowRun;
  events: RunEvent[];
}

export interface BlockDefinition {
  id: string;
  type: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  inputs: Array<{
    id: string;
    name: string;
    type?: string;
  }>;
  outputs: Array<{
    id: string;
    name: string;
    type?: string;
  }>;
  schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
  pluginId: string;
}

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
  if (!res.ok) {
    throw new Error('Failed to fetch blocks');
  }
  return res.json();
}

export async function fetchWorkflowRuns(workflowId?: string): Promise<WorkflowRun[]> {
  const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
  const res = await fetch(`${API_BASE}/workflows/runs${query}`);
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export async function fetchWorkflowRun(runId: string): Promise<WorkflowRunDetail | null> {
  const res = await fetch(`${API_BASE}/workflows/runs/${encodeURIComponent(runId)}`);
  if (!res.ok) {
    return null;
  }
  return res.json();
}

export async function saveWorkflow(workflow: Workflow): Promise<{
  ok: boolean;
  id: string;
}> {
  const res = await fetch(`${API_BASE}/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflow),
  });
  return res.json();
}

export async function deleteWorkflow(id: string): Promise<{
  ok: boolean;
}> {
  const res = await fetch(`${API_BASE}/workflows/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function enableWorkflow(id: string): Promise<{
  ok: boolean;
}> {
  const res = await fetch(`${API_BASE}/workflows/enable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
    }),
  });
  return res.json();
}

export async function disableWorkflow(id: string): Promise<{
  ok: boolean;
}> {
  const res = await fetch(`${API_BASE}/workflows/disable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
    }),
  });
  return res.json();
}

export interface PortValue {
  blockId: string;
  port: string;
  value: unknown;
  ts: number;
  count: number;
}

/** Last-seen output values per port of a running workflow (empty when stopped). */
export async function fetchWorkflowPortValues(id: string): Promise<PortValue[]> {
  const res = await fetch(`${API_BASE}/workflows/${id}/values`);
  if (!res.ok) {
    return [];
  }
  return res.json();
}

/**
 * Manually poke a block's input on a RUNNING workflow (the Run control).
 * With `replay`, the hub re-delivers the value that last flowed into the
 * port instead of an empty trigger.
 */
export async function injectBlock(
  blockId: string,
  port: string,
  options?: { replay?: boolean }
): Promise<{
  ok: boolean;
}> {
  const res = await fetch(`${API_BASE}/workflows/inject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      blockId,
      port,
      replay: options?.replay ?? false,
    }),
  });
  return res.json();
}

// Create test workflow event source
export function createTestEventSource(
  workflowId: string,
  payload: Record<string, unknown>
): EventSource {
  const params = new URLSearchParams({
    id: workflowId,
    payload: JSON.stringify(payload),
  });
  return new EventSource(`${API_BASE}/workflows/test?${params}`);
}

// Create live workflow events SSE connection
export function createWorkflowEventsSource(workflowId: string): EventSource {
  return new EventSource(`${API_BASE}/workflows/${workflowId}/events`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools API
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolSummary {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolSchema {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  inputSchema: Record<string, unknown>;
}

export async function fetchTools(): Promise<ToolSummary[]> {
  const res = await fetch(`${API_BASE}/tools`);
  if (!res.ok) {
    throw new Error('Failed to fetch tools');
  }
  return res.json();
}

export async function fetchToolSchema(toolId: string): Promise<ToolSchema> {
  const res = await fetch(`${API_BASE}/tools/${encodeURIComponent(toolId)}/schema`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tool schema: ${toolId}`);
  }
  return res.json();
}
