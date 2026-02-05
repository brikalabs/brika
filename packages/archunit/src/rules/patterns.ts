import type { Rule } from '../types';

const EXPORT_REGEX = /export\s+(?:function|const|class)\s+(\w+)/g;

/** Exports in files must match naming convention */
export function exportsMatch(pattern: string, exportPattern: RegExp, description: string): Rule {
  return {
    name: `Exports in "${pattern}" must ${description}`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const content = await ctx.read(file);
        for (const [, name] of content.matchAll(EXPORT_REGEX)) {
          if (name && !exportPattern.test(name)) {
            yield { file, message: `Export "${name}" does not match pattern` };
          }
        }
      }
    },
  };
}

/** Files must not contain specific patterns */
export function noPattern(filePattern: string, codePattern: RegExp, description: string): Rule {
  return {
    name: `"${filePattern}" must not contain ${description}`,
    async *check(ctx) {
      for await (const file of ctx.glob(filePattern)) {
        const content = await ctx.read(file);
        for (const match of content.matchAll(new RegExp(codePattern, 'g'))) {
          const line = content.substring(0, match.index).split('\n').length;
          yield { file, line, message: `Found ${description}` };
        }
      }
    },
  };
}

/** Files must contain specific patterns */
export function mustContain(filePattern: string, codePattern: RegExp, description: string): Rule {
  return {
    name: `"${filePattern}" must contain ${description}`,
    async *check(ctx) {
      for await (const file of ctx.glob(filePattern)) {
        const content = await ctx.read(file);
        if (!codePattern.test(content)) {
          yield { file, message: `Missing ${description}` };
        }
      }
    },
  };
}
