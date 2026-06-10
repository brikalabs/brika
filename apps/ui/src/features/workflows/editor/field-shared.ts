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

// ─── Conditional visibility (showWhen) ───────────────────────────────────────

export type ShowWhenValue = string | number | boolean;

/** A field is shown (and can be required) only when another field matches. */
export interface ShowWhen {
  field: string;
  equals: ShowWhenValue | ReadonlyArray<ShowWhenValue>;
}

export function isShowWhenValue(value: unknown): value is ShowWhenValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function toShowWhen(value: unknown): ShowWhen | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const obj = Object.fromEntries(Object.entries(value));
  const { equals } = obj;
  if (typeof obj.field !== 'string') {
    return undefined;
  }
  if (isShowWhenValue(equals)) {
    return { field: obj.field, equals };
  }
  if (Array.isArray(equals) && equals.every(isShowWhenValue)) {
    return { field: obj.field, equals };
  }
  return undefined;
}

/** Whether the live field value satisfies a showWhen condition. */
export function showWhenSatisfied(
  actual: unknown,
  equals: ShowWhenValue | ReadonlyArray<ShowWhenValue>
): boolean {
  if (Array.isArray(equals)) {
    return isShowWhenValue(actual) && equals.includes(actual);
  }
  return actual === equals;
}
