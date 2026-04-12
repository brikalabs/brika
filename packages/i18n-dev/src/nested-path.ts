/**
 * Shared utilities for dot-separated nested object path operations.
 * Used by both the Vite server (vite.ts) and the client overlay (store.ts).
 */

/** Set a value at a dot-separated path, creating intermediates as needed. */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: string) {
  const parts = path.split('.');
  const lastPart = parts.pop();
  if (!lastPart) {
    return;
  }
  let current = obj;
  for (const part of parts) {
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[lastPart] = value;
}

/** Delete a value at a dot-separated path. No-op if any segment is missing. */
export function deleteNestedValue(obj: Record<string, unknown>, path: string) {
  const resolved = resolvePath(obj, path);
  if (resolved) {
    delete resolved.parent[resolved.key];
  }
}

/** Resolve a dot-path to `{ parent, key }`, or `undefined` if any segment is missing. */
export function resolvePath(obj: Record<string, unknown>, path: string) {
  const parts = path.split('.');
  const lastPart = parts.pop();
  if (!lastPart) {
    return undefined;
  }
  let current = obj;
  for (const part of parts) {
    if (typeof current[part] !== 'object' || current[part] === null) {
      return undefined;
    }
    current = current[part] as Record<string, unknown>;
  }
  return { parent: current, key: lastPart };
}
