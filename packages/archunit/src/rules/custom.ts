import type { FixResult, Rule, RuleContext, Violation } from '../types';

type CheckFn = (ctx: RuleContext) => AsyncIterable<Violation> | Promise<Violation[]>;
type FixFn = (
  ctx: RuleContext,
  violations: Violation[]
) => AsyncIterable<FixResult> | Promise<FixResult[]>;

/** Create a custom rule */
export function custom(name: string, check: CheckFn, fix?: FixFn): Rule {
  return {
    name,
    check,
    fix,
  };
}
