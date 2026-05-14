/**
 * Hand-rolled validator for parsed `mortar.yml`. Keeps zod out of the
 * dep graph for what is effectively a single config file. Friendly
 * error paths (`services.hub.health.port: must be a port`) let users
 * pinpoint the offending field without a stack trace.
 *
 * Cycle detection runs as part of `validateConfig` so callers further
 * downstream (supervisor, dependency-graph view) can assume a DAG.
 */

import { AUTO_HEALTH_TIMEOUT_MS, EXPLICIT_HEALTH_TIMEOUT_MS } from '../constants';
import { ConfigError } from '../errors';
import type { HealthCheck, MortarConfig, ServiceSpec } from './types';

export function validateConfig(input: unknown): MortarConfig {
  const root = asObject(input, 'mortar.yml');
  const servicesObj = asObject(root.services, 'services');
  const services: ServiceSpec[] = [];
  for (const [id, raw] of Object.entries(servicesObj)) {
    services.push(parseService(id, raw));
  }
  if (services.length === 0) {
    throw new ConfigError('mortar.yml', 'at least one service is required');
  }
  validateDependsOn(services);
  return { services };
}

function parseService(id: string, raw: unknown): ServiceSpec {
  const obj = asObject(raw, `services.${id}`);
  const port = obj.port === undefined ? null : asPort(obj.port, `services.${id}.port`);
  return {
    id,
    label: asString(obj.label, `services.${id}.label`),
    command: asString(obj.command, `services.${id}.command`),
    env: obj.env === undefined ? {} : asStringMap(obj.env, `services.${id}.env`),
    dependsOn:
      obj.dependsOn === undefined ? [] : asStringArray(obj.dependsOn, `services.${id}.dependsOn`),
    cwd: obj.cwd === undefined ? null : asString(obj.cwd, `services.${id}.cwd`),
    port,
    health: parseHealth(obj.health, `services.${id}.health`, port),
    url: obj.url === undefined ? null : asString(obj.url, `services.${id}.url`),
  };
}

function parseHealth(raw: unknown, path: string, declaredPort: number | null): HealthCheck {
  // When the service declares an explicit `port:`, that's the
  // authoritative answer — health becomes a TCP probe against it.
  // The user can still override with an explicit `health:` block;
  // this only kicks in when health is unspecified.
  if (raw === undefined) {
    if (declaredPort !== null) {
      return { kind: 'tcp', port: declaredPort, timeoutMs: EXPLICIT_HEALTH_TIMEOUT_MS };
    }
    return { kind: 'auto', timeoutMs: AUTO_HEALTH_TIMEOUT_MS };
  }
  const obj = asObject(raw, path);
  const kind = asString(obj.kind, `${path}.kind`);
  if (kind === 'http') {
    return {
      kind: 'http',
      url: asString(obj.url, `${path}.url`),
      timeoutMs: asPositiveInt(obj.timeoutMs ?? EXPLICIT_HEALTH_TIMEOUT_MS, `${path}.timeoutMs`),
    };
  }
  if (kind === 'tcp') {
    return {
      kind: 'tcp',
      port: asPort(obj.port, `${path}.port`),
      timeoutMs: asPositiveInt(obj.timeoutMs ?? EXPLICIT_HEALTH_TIMEOUT_MS, `${path}.timeoutMs`),
    };
  }
  if (kind === 'auto') {
    return {
      kind: 'auto',
      timeoutMs: asPositiveInt(obj.timeoutMs ?? AUTO_HEALTH_TIMEOUT_MS, `${path}.timeoutMs`),
    };
  }
  if (kind === 'none') {
    return { kind: 'none' };
  }
  throw new ConfigError(
    `${path}.kind`,
    `must be one of "http", "tcp", "auto", "none" (got "${kind}")`
  );
}

function validateDependsOn(services: readonly ServiceSpec[]): void {
  const byId = new Map<string, ServiceSpec>();
  for (const svc of services) {
    byId.set(svc.id, svc);
  }
  // First pass: every dep must reference a real service; no self-edges.
  for (const svc of services) {
    for (const dep of svc.dependsOn) {
      if (!byId.has(dep)) {
        throw new ConfigError(`services.${svc.id}.dependsOn`, `unknown service "${dep}"`);
      }
      if (dep === svc.id) {
        throw new ConfigError(`services.${svc.id}.dependsOn`, 'cannot depend on itself');
      }
    }
  }
  // Second pass: cycle detection via DFS with three-color marking.
  // White = unseen, gray = on the current DFS stack, black = fully
  // explored. Encountering a gray node = back-edge = cycle.
  detectCycle(services, byId);
}

/**
 * Throw {@link ConfigError} with the offending path if any cycle exists
 * in the `dependsOn` graph. The error message lists the cycle in order
 * (a → b → c → a) so the user can see what to break.
 */
function detectCycle(
  services: readonly ServiceSpec[],
  byId: ReadonlyMap<string, ServiceSpec>
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const svc of services) {
    color.set(svc.id, WHITE);
  }

  const stack: string[] = [];

  const visit = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    const svc = byId.get(id);
    if (!svc) {
      return;
    }
    for (const dep of svc.dependsOn) {
      const c = color.get(dep) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(dep);
        const cycle = [...stack.slice(start), dep].join(' → ');
        throw new ConfigError(`services.${id}.dependsOn`, `dependency cycle detected: ${cycle}`);
      }
      if (c === WHITE) {
        visit(dep);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const svc of services) {
    if (color.get(svc.id) === WHITE) {
      visit(svc.id);
    }
  }
}

// ─── coercion primitives ────────────────────────────────────────────────────

function asObject(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ConfigError(path, 'must be a mapping');
  }
  return v as Record<string, unknown>;
}

function asString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new ConfigError(path, 'must be a non-empty string');
  }
  return v;
}

function asPositiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new ConfigError(path, 'must be a positive integer');
  }
  return v;
}

function asPort(v: unknown, path: string): number {
  const n = asPositiveInt(v, path);
  if (n > 65_535) {
    throw new ConfigError(path, 'must be a port in [1, 65535]');
  }
  return n;
}

function asStringArray(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) {
    throw new ConfigError(path, 'must be an array of strings');
  }
  return v.map((item, i) => asString(item, `${path}[${i}]`));
}

function asStringMap(v: unknown, path: string): Record<string, string> {
  const obj = asObject(v, path);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      out[k] = val;
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[k] = String(val);
    } else {
      throw new ConfigError(`${path}.${k}`, 'must be a string/number/boolean');
    }
  }
  return out;
}
