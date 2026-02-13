import type { Rule, RuleContext, Violation } from '../types';

export type DirCheckFn = (
  ctx: RuleContext,
  dir: string
) => Violation | undefined | Promise<Violation | undefined>;

export type DirCheckFactory<Args extends unknown[] = []> = (...args: Args) => {
  name: string;
  check: DirCheckFn;
};

/** Directory rule builder with extensible check methods */
export class DirRule {
  readonly #pattern: string;
  readonly #checks: DirCheckFn[] = [];
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
  _addCheck(name: string, check: DirCheckFn): this {
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

    const checkNames = this.#name || 'check';
    const reasonSuffix = reason ? ` (${reason})` : '';
    const name = `${pattern} should ${checkNames}${reasonSuffix}`;

    return {
      name,
      async *check(ctx: RuleContext) {
        if (skipped) return;
        for await (const dir of ctx.glob(pattern)) {
          for (const check of checks) {
            const violation = await check(ctx, dir);
            if (violation) yield violation;
          }
        }
      },
    };
  }
}

/**
 * Register a check method on DirRule
 * Uses declaration merging on DirRule interface for type safety
 */
export function registerDirCheck<Args extends unknown[]>(
  methodName: string,
  factory: DirCheckFactory<Args>
): void {
  (DirRule.prototype as unknown as Record<string, unknown>)[methodName] = function (
    this: DirRule,
    ...args: Args
  ) {
    const { name, check } = factory(...args);
    return this._addCheck(name, check);
  };
}
