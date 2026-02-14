/**
 * Rule Normalization
 *
 * Shared helpers for converting mixed RuleInput arrays into flat Rule arrays.
 */

import type { Buildable, Rule, RuleInput } from './types';

export function isBuildable(input: RuleInput): input is Buildable {
  return typeof input === 'object' && 'build' in input && typeof input.build === 'function';
}

export function isRule(input: RuleInput): input is Rule {
  return typeof input === 'object' && 'check' in input && typeof input.check === 'function';
}

/** Normalize mixed inputs into flat Rule array */
export function normalizeRules(inputs: RuleInput[]): Rule[] {
  const rules: Rule[] = [];
  for (const input of inputs) {
    if (Array.isArray(input)) {
      rules.push(...normalizeRules(input));
    } else if (isBuildable(input)) {
      rules.push(input.build());
    } else if (isRule(input)) {
      rules.push(input);
    }
  }
  return rules;
}
