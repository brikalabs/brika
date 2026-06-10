/**
 * Types and helpers shared by the schema-form core (ConfigPanel) and the
 * extracted field modules (ToolFields), kept separate to avoid import cycles.
 */

export interface Variable {
  name: string;
  source: string;
  type: string;
  /** Short rendering of the value last seen on this path, when one has flowed. */
  preview?: string;
}

export interface DynamicOption {
  value: string;
  label: string;
  description?: string;
}

export interface ResolvedFieldInfo {
  label: string;
  cleanDescription: string | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
  variables: Variable[];
  defaultValue: unknown;
  name: string;
  blockType?: string;
  allConfig?: Record<string, unknown>;
  inputPortIds?: string[];
  configKeys?: string[];
}

/**
 * Safely convert a value to string, handling objects and nullish values
 */
export function toDisplayString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // symbol | function — not expected for config values.
  return fallback;
}
