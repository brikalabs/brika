import type { Buildable, Rule, RuleInput } from './types';

const registered: Buildable[] = [];

function isBuildable(input: RuleInput): input is Buildable {
  return typeof input === 'object' && 'build' in input && typeof input.build === 'function';
}

function isRule(input: RuleInput): input is Rule {
  return typeof input === 'object' && 'check' in input && typeof input.check === 'function';
}

/** Register a buildable rule (called automatically by files/dirs) */
export function register(buildable: Buildable): void {
  registered.push(buildable);
}

/** Register rules explicitly */
export function use(...inputs: RuleInput[]): void {
  for (const input of inputs) {
    if (Array.isArray(input)) {
      for (const i of input) {
        use(i);
      }
    } else if (isBuildable(input)) {
      registered.push(input);
    } else if (isRule(input)) {
      registered.push({
        build: () => input,
      });
    }
  }
}

/** Get all registered rules (used by CLI) */
export function getRegisteredRules(): Rule[] {
  return registered.map((b) => b.build());
}

/** Clear registry (used for testing) */
export function clearRegistry(): void {
  registered.length = 0;
}
