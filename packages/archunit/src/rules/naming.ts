import type { Rule } from '../types';

const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;
const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function getFileName(path: string): string {
  return path
    .split('/')
    .pop()
    ?.replace(/\.\w+$/, '');
}

/** Files matching pattern must use PascalCase naming */
export function pascalCase(pattern: string): Rule {
  return {
    name: `"${pattern}" must be PascalCase`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const name = getFileName(file);
        if (!PASCAL_CASE.test(name)) {
          yield {
            file,
            message: `"${name}" is not PascalCase`,
          };
        }
      }
    },
  };
}

/** Files matching pattern must use camelCase naming */
export function camelCase(pattern: string): Rule {
  return {
    name: `"${pattern}" must be camelCase`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const name = getFileName(file);
        if (!CAMEL_CASE.test(name)) {
          yield {
            file,
            message: `"${name}" is not camelCase`,
          };
        }
      }
    },
  };
}

/** Files matching pattern must use kebab-case naming */
export function kebabCase(pattern: string): Rule {
  return {
    name: `"${pattern}" must be kebab-case`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const name = getFileName(file);
        if (!KEBAB_CASE.test(name)) {
          yield {
            file,
            message: `"${name}" is not kebab-case`,
          };
        }
      }
    },
  };
}
