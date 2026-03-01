import type { Rule } from '../types';

/** Files matching pattern must be under max lines */
export function maxLines(pattern: string, max: number): Rule {
  return {
    name: `"${pattern}" must be under ${max} lines`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const lines = await ctx.lines(file);
        if (lines > max) {
          yield {
            file,
            message: `${lines} lines (max ${max})`,
            suggestion: 'Split into smaller files',
          };
        }
      }
    },
  };
}

/** Directories matching pattern must contain required files */
export function requiredFiles(dirPattern: string, files: string[]): Rule {
  return {
    name: `"${dirPattern}" must contain ${files.join(', ')}`,
    async *check(ctx) {
      for await (const dir of ctx.glob(dirPattern)) {
        for (const file of files) {
          const path = dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`;
          if (!(await ctx.exists(path))) {
            yield {
              file: dir,
              message: `Missing "${file}"`,
            };
          }
        }
      }
    },
  };
}
