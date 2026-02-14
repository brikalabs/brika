import { normalizeRules } from '../normalize';
import type { Rule, RuleInput } from '../types';

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
