/**
 * Pure predicate for the "When Device Changes" watched-attribute conditions.
 *
 * Each watched attribute carries an optional condition:
 *   - 'changes' (default): fire on any change of the stringified value.
 *   - 'becomes': fire when the new value equals `value` (string compare on the
 *     stringified state; booleans match 'true'/'false') and was different before.
 *   - 'above' / 'below': numeric compare against Number(value), edge-triggered:
 *     fires only when the comparison NEWLY becomes true (crossing a threshold
 *     fires once, repeated reports past it do not).
 *
 * Pure logic, no matter.js and no zod, so it is unit-testable in isolation.
 */

export const ATTRIBUTE_CONDITION_VALUES = ['changes', 'becomes', 'above', 'below'] as const;

export type AttributeConditionKind = (typeof ATTRIBUTE_CONDITION_VALUES)[number];

export interface AttributeCondition {
  when?: AttributeConditionKind;
  /** Comparison operand for 'becomes' (string) and 'above'/'below' (numeric). */
  value?: string;
}

function satisfies(kind: 'above' | 'below', candidate: number, threshold: number): boolean {
  return kind === 'above' ? candidate > threshold : candidate < threshold;
}

/** Blank or missing thresholds never match (NaN fails every comparison). */
function parseThreshold(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return Number.NaN;
  }
  return Number(value);
}

function numericEdge(
  kind: 'above' | 'below',
  threshold: number,
  previous: string | undefined,
  next: string
): boolean {
  const current = Number(next);
  if (!Number.isFinite(threshold) || !Number.isFinite(current)) {
    return false;
  }
  if (!satisfies(kind, current, threshold)) {
    return false;
  }
  // Edge trigger: fire only if the previous value did NOT satisfy the
  // comparison. An unknown previous value (first report) counts as crossing.
  const before = Number(previous);
  return !(Number.isFinite(before) && satisfies(kind, before, threshold));
}

/**
 * Decide whether a watched attribute should fire for a state transition.
 * `previous` is undefined on the first observed report.
 */
export function conditionMet(
  condition: AttributeCondition,
  previous: string | undefined,
  next: string
): boolean {
  const when = condition.when ?? 'changes';
  if (when === 'changes') {
    return next !== previous;
  }
  if (when === 'becomes') {
    return next === condition.value && next !== previous;
  }
  return numericEdge(when, parseThreshold(condition.value), previous, next);
}
