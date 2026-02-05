import type { Rule, RuleContext, Violation } from '../types';

export type CheckFn = (
  ctx: RuleContext,
  file: string,
  content: string
) => Violation | undefined | Promise<Violation | undefined>;

export type CheckFactory<Args extends unknown[] = []> = (...args: Args) => {
  name: string;
  check: CheckFn;
};

/** File rule builder with extensible check methods */
export class FileRule {
  #pattern: string;
  #checks: CheckFn[] = [];
  #name = '';
  #reason = '';
  #skipped = false;

  constructor(pattern: string) {
    this.#pattern = pattern;
  }

  /** Skip this rule (useful for temporarily disabling) */
  skip(): this {
    this.#skipped = true;
    return this;
  }

  /** @internal */
  _addCheck(name: string, check: CheckFn): this {
    this.#name = name;
    this.#checks.push(check);
    return this;
  }

  /** Add a reason for this rule */
  because(reason: string): this {
    this.#reason = reason;
    return this;
  }

  /** Chain with "and" for readability */
  and(): this {
    return this;
  }

  /** Build the rule */
  build(): Rule {
    const pattern = this.#pattern;
    const checks = this.#checks;
    const reason = this.#reason;
    const skipped = this.#skipped;

    const patternName = pattern.split('/').pop() ?? pattern;
    const checkNames = this.#name || checks.map(() => 'check').join(', ');
    const name = `${patternName} should ${checkNames}${reason ? ` (${reason})` : ''}`;

    return {
      name,
      async *check(ctx: RuleContext) {
        if (skipped) return;
        for await (const file of ctx.glob(pattern)) {
          const content = await ctx.read(file);
          for (const check of checks) {
            const violation = await check(ctx, file, content);
            if (violation) yield violation;
          }
        }
      },
    };
  }
}

/**
 * Register a check method on FileRule
 * Uses declaration merging on FileRule interface for type safety
 */
export function registerCheck<Args extends unknown[]>(
  methodName: string,
  factory: CheckFactory<Args>
): void {
  (FileRule.prototype as unknown as Record<string, unknown>)[methodName] = function (
    this: FileRule,
    ...args: Args
  ) {
    const { name, check } = factory(...args);
    return this._addCheck(name, check);
  };
}
