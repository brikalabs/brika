/**
 * SonarCloud API client + response types.
 *
 * Auth: read-only requests work anonymously on public projects; writes
 * require `SONAR_TOKEN`. Set the active pull-request scope via
 * `setPrKey` so every command picks up `?pullRequest=<n>` automatically.
 */

import { c, die } from './cli';

export const PROJECT_KEY = Bun.env.SONAR_PROJECT ?? 'brika';
export const BASE_URL = Bun.env.SONAR_URL ?? 'https://sonarcloud.io';

let prKey: string | undefined;

/** Set the active pull-request key (`undefined` = main branch). */
export function setPrKey(value: string | undefined): void {
  prKey = value;
}

/** Returns `{ pullRequest: <key> }` when a PR is active, else `{}`. */
export function prParam(): Record<string, string> {
  return prKey ? { pullRequest: prKey } : {};
}

function readHeaders(): HeadersInit {
  const token = Bun.env.SONAR_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function requireToken(): string {
  const token = Bun.env.SONAR_TOKEN;
  if (!token) {
    die(
      `SONAR_TOKEN is required for write operations.\n  ${c.dim}Get yours at: ${c.cyan}https://sonarcloud.io/account/security${c.reset}`
    );
  }
  return token;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireToken()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

export async function api<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: readHeaders() });
  if (!res.ok) {
    const text = await res.text();
    die(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, string>
): Promise<T | string> {
  const url = new URL(path, BASE_URL);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: authHeaders(),
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    die(`API ${res.status} ${res.statusText}: ${text}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) {
    return res.json() as Promise<T>;
  }
  return res.text();
}

/* ─── Response types ─────────────────────────────────────────── */

export interface Issue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  line?: number;
  message: string;
  type: string;
}

export interface IssueSearchResult {
  total: number;
  p: number;
  ps: number;
  issues: Issue[];
}

export interface Hotspot {
  key: string;
  rule: string;
  component: string;
  line?: number;
  message: string;
  vulnerabilityProbability: string;
  status: string;
}

export interface HotspotSearchResult {
  paging: {
    total: number;
    pageIndex: number;
    pageSize: number;
  };
  hotspots: Hotspot[];
}

export interface MeasurePeriod {
  index: number;
  value: string;
  bestValue?: boolean;
}

export interface ComponentMeasure {
  metric: string;
  value?: string;
  periods?: MeasurePeriod[];
}

export interface ComponentTree {
  components: Array<{
    path: string;
    measures: ComponentMeasure[];
  }>;
}

export interface ProjectMeasures {
  component: {
    measures: Array<{
      metric: string;
      value: string;
    }>;
  };
}
