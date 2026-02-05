import type { Buildable, Rule, RuleInput } from '../types';

function isBuildable(input: RuleInput): input is Buildable {
  return typeof input === 'object' && 'build' in input && typeof input.build === 'function';
}

function isRule(input: RuleInput): input is Rule {
  return typeof input === 'object' && 'check' in input && typeof input.check === 'function';
}

/** Normalize mixed inputs into flat Rule array */
function normalizeRules(inputs: RuleInput[]): Rule[] {
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

/**
 * Define a preset using the fluent DSL
 *
 * @example
 * export const myPreset = definePreset<MyOptions>((options = {}) => [
 *   files('src/*.ts').should().beCamelCase(),
 *   dirs('src/features/').should().containFiles('index.ts'),
 * ]);
 */
export function definePreset<T = void>(
  factory: (options: T) => RuleInput[]
): (options?: T) => Rule[] {
  return (options?: T) => normalizeRules(factory(options as T));
}
