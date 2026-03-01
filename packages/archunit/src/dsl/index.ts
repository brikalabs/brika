import type { Rule } from '../types';
import { DirRule } from './dir-rule';
import { FileRule } from './file-rule';

// Import all checks to register them
import './checks';

// ─────────────────────────────────────────────────────────────────────────────
// Entry Points
// ─────────────────────────────────────────────────────────────────────────────

interface FileBuilder {
  should(): FileRule;
}

interface DirBuilder {
  should(): DirRule;
}

/**
 * Define rules for files matching a glob pattern
 * @example
 * files('src/components/*.tsx')
 *   .should()
 *   .bePascalCase()
 *   .and()
 *   .haveMaxLines(200)
 */
export function files(pattern: string): FileBuilder {
  return {
    should: () => new FileRule(pattern),
  };
}

/**
 * Define rules for directories matching a glob pattern
 * @example
 * dirs('src/features/*')
 *   .should()
 *   .containFiles('index.ts', 'hooks.ts')
 */
export function dirs(pattern: string): DirBuilder {
  return {
    should: () => new DirRule(pattern),
  };
}

type Buildable = {
  build(): Rule;
};

/**
 * Collect rules from fluent builders
 * @example
 * arch(
 *   files('*.tsx').should().bePascalCase(),
 *   dirs('features/*').should().containFiles('index.ts'),
 * )
 */
export function arch(...rules: Buildable[]): Rule[] {
  return rules.map((r) => r.build());
}

export type { DirCheckFactory, DirCheckFn } from './dir-rule';
export { DirRule, registerDirCheck } from './dir-rule';
export type { CheckFactory, CheckFn } from './file-rule';
export { FileRule, registerCheck } from './file-rule';
