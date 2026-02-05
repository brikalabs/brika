export interface Violation {
  file: string;
  message: string;
  line?: number;
  suggestion?: string;
}

export interface RuleContext {
  glob: (pattern: string) => AsyncIterable<string>;
  read: (path: string) => Promise<string>;
  exists: (path: string) => Promise<boolean>;
  lines: (path: string) => Promise<number>;
  cwd: string;
}

export interface Rule {
  name: string;
  check: (ctx: RuleContext) => AsyncIterable<Violation> | Promise<Violation[]>;
}

export interface ArchConfig {
  cwd?: string;
  rules: Rule[];
  failFast?: boolean;
}

export interface Buildable {
  build(): Rule;
}

export type RuleInput = Rule | Rule[] | Buildable;

export interface ArchResult {
  passed: boolean;
  violations: { rule: string; violations: Violation[] }[];
  elapsed: number;
  rulesChecked: number;
  filesScanned: number;
}
