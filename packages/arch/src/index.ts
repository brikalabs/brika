// DSL (fluent API)
export { arch, dirs, files } from './dsl';
// Registry
export { use } from './registry';
// Rules (function API)
export {
  camelCase,
  custom,
  exportsMatch,
  kebabCase,
  maxLines,
  mustContain,
  noImportsFrom,
  noPattern,
  onlyImportsFrom,
  pascalCase,
  requiredFiles,
} from './rules';
// Runner
export { defineConfig, printResult, run, runArch } from './runner';
export type { ArchConfig, ArchResult, Rule, RuleContext, Violation } from './types';
