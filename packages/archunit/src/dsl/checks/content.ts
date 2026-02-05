import { registerCheck } from '../file-rule';

declare module '../file-rule' {
  interface FileRule {
    /** Files should have at most N lines */
    haveMaxLines(max: number): this;
    /** Files should contain a pattern */
    contain(pattern: RegExp, description?: string): this;
    /** Files should not contain a pattern */
    notContain(pattern: RegExp, description?: string): this;
  }
}

registerCheck('haveMaxLines', (max: number) => ({
  name: `≤ ${max} lines`,
  check: async (ctx, file) => {
    const lines = await ctx.lines(file);
    if (lines > max) {
      return {
        file,
        message: `${lines} lines (max ${max})`,
        suggestion: 'Split into smaller files',
      };
    }
  },
}));

registerCheck('contain', (pattern: RegExp, description?: string) => {
  const desc = description ?? pattern.source;
  return {
    name: `contain ${desc}`,
    check: (_, file, content) => {
      if (!pattern.test(content)) {
        return { file, message: `Missing ${desc}` };
      }
    },
  };
});

registerCheck('notContain', (pattern: RegExp, description?: string) => {
  const desc = description ?? pattern.source;
  return {
    name: `not contain ${desc}`,
    check: (_, file, content) => {
      const match = content.match(pattern);
      if (match) {
        const line = content.substring(0, match.index).split('\n').length;
        return { file, line, message: `Found ${desc}` };
      }
    },
  };
});
